#!/usr/bin/env python3
"""匯入固定版本的 JLPT 參考詞彙；只使用 Python 標準函式庫，不執行上游程式。"""

import argparse
import csv
import hashlib
import io
import json
import re
import unicodedata
import urllib.request
from collections import defaultdict
from decimal import Decimal
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "sources/anki-jlpt-decks"
LEVELS = ("N5", "N4", "N3", "N2", "N1")
KANA = re.compile(r"[ぁ-ゖァ-ヺー・〜～\s]+")
FURIGANA = re.compile(r"\[[ぁ-ゖァ-ヺー・〜～]+\]")
HEADERS = ["#separator:Tab", "#html:true", "#notetype column:1", "#deck column:2", "#tags column:39"]


class PlainText(HTMLParser):
    """移除標籤、非文字內容與 ruby 注音，不載入任何 URL。"""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "iframe", "object", "rt", "rp"):
            self.hidden.append(tag)
        elif not self.hidden and tag in ("br", "p", "div", "li"):
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if self.hidden and tag == self.hidden[-1]:
            self.hidden.pop()
        elif not self.hidden and tag in ("p", "div", "li"):
            self.parts.append(" ")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def plain(value):
    parser = PlainText()
    parser.feed(value)
    parser.close()
    value = re.sub(r"\[sound:[^\]]*\]", "", "".join(parser.parts))
    value = re.sub(r"[\x00-\x1f\x7f]", " ", value)
    return unicodedata.normalize("NFC", re.sub(r"\s+", " ", value).strip())


def dumps(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify_sources(manifest, download):
    for item in manifest["files"]:
        path = SOURCE / item["path"]
        if not path.exists() and download:
            with urllib.request.urlopen(item["url"], timeout=60) as response:
                data = response.read()
            if len(data) != item["bytes"] or digest(data) != item["sha256"]:
                raise ValueError(f"下載內容不符固定來源：{item['path']}")
            path.write_bytes(data)
        if not path.exists():
            raise ValueError(f"缺少 {path}；可加 --download 下載固定版本")
        data = path.read_bytes()
        if len(data) != item["bytes"] or digest(data) != item["sha256"]:
            raise ValueError(f"來源檔案 SHA-256 或大小不符：{path}")


def import_rows(data):
    lines = data.decode("utf-8").splitlines()
    if lines[:5] != HEADERS:
        raise ValueError("上游 CSV 欄位宣告已變更，需先人工確認映射")
    rows = list(csv.reader(io.StringIO("\n".join(lines[5:])), delimiter="\t"))
    candidates, adjustments, mismatches = [], [], []
    source_ids = set()
    for number, row in enumerate(rows, 6):
        if len(row) != 39:
            raise ValueError(f"來源第 {number} 列不是 39 欄")
        source_id = row[2]
        if not re.fullmatch(r"[0-9a-f-]{36}", source_id) or source_id in source_ids:
            raise ValueError(f"缺漏或重複的來源識別碼：{source_id}")
        source_ids.add(source_id)
        deck_levels = set(re.findall(r"N[1-5]", row[1]))
        tag_levels = set(re.findall(r"::(?:\d-)?(N[1-5])", row[38]))
        if len(deck_levels) != 1 or len(tag_levels) != 1:
            raise ValueError(f"無法唯一判斷級別：{source_id}")
        # 上游 README 說明：舊牌組分類可能未移動，標籤才是更新後級別。
        level = next(iter(tag_levels))
        if tag_levels != deck_levels:
            mismatches.append({"sourceId": source_id, "deckLevels": sorted(deck_levels), "tagLevel": level})
        word = FURIGANA.sub("", plain(row[3])).replace(" ", "")
        kana = plain(row[6])
        if not KANA.fullmatch(kana):
            # 外來語的 VocabKana 欄位實際是詞源；片假名原詞本身就是讀音。
            if not KANA.fullmatch(word):
                raise ValueError(f"無法建立假名讀音：{source_id} {word}")
            adjustments.append({"sourceId": source_id, "word": word, "sourceValue": kana, "kana": word})
            kana = word
        kana = kana.replace(" ", "")
        meaning = plain(row[8])  # 專取繁體中文欄位，不回退到簡體中文。
        if not word or not kana or not meaning:
            raise ValueError(f"必要欄位缺漏：{source_id}")
        example, translation = "", ""
        for index in (12, 18, 24, 30):
            if row[index - 1] in ("", "例") and plain(row[index]):
                example, translation = plain(row[index]), plain(row[index + 3])
                break
        candidates.append({
            "level": level, "word": word, "kana": kana, "meaning": meaning,
            "example": example, "translation": translation, "sourceId": source_id,
            "sourceLevel": level, "rank": Decimal(row[35]), "sourceRow": number,
        })
    return candidates, adjustments, mismatches


def assemble(candidates):
    groups = defaultdict(list)
    for candidate in candidates:
        groups[(candidate["word"], candidate["kana"])].append(candidate)
    vocabulary, duplicates = [], []
    for (word, kana), entries in groups.items():
        entries.sort(key=lambda item: (LEVELS.index(item["level"]), item["rank"], item["sourceId"]))
        first = entries[0]
        item = {"id": "jlpt-" + digest((word + "\0" + kana).encode("utf-8"))[:20]}
        item.update({key: value for key, value in first.items() if key not in ("rank", "sourceRow")})
        item["meaning"] = "；".join(dict.fromkeys(entry["meaning"] for entry in entries))
        item["sourceLevels"] = [level for level in LEVELS if any(entry["level"] == level for entry in entries)]
        if not item["example"]:
            for entry in entries[1:]:
                if entry["example"]:
                    item["example"], item["translation"] = entry["example"], entry["translation"]
                    break
        if len(entries) > 1:
            item["sourceIds"] = [entry["sourceId"] for entry in entries]
            duplicates.append({
                "id": item["id"], "word": word, "kana": kana, "retainedLevel": item["level"],
                "sourceLevels": item["sourceLevels"],
                "sources": [{key: entry[key] for key in ("sourceId", "sourceLevel", "sourceRow", "meaning")} for entry in entries],
            })
        vocabulary.append((LEVELS.index(first["level"]), first["rank"], item["id"], item))
    vocabulary.sort(key=lambda entry: entry[:3])
    return [entry[3] for entry in vocabulary], sorted(duplicates, key=lambda entry: entry["id"])


def validate(vocabulary):
    ids, pairs = set(), set()
    for item in vocabulary:
        if item["id"] in ids or (item["word"], item["kana"]) in pairs:
            raise ValueError("匯入結果存在重複識別碼或詞形／讀音")
        ids.add(item["id"])
        pairs.add((item["word"], item["kana"]))
        if item["level"] not in LEVELS or not KANA.fullmatch(item["kana"]):
            raise ValueError(f"級別或讀音無效：{item['id']}")
        for field in ("word", "kana", "meaning", "example", "translation"):
            value = item[field]
            if re.search(r"<[^>]+>|\[sound:|[\x00-\x1f\x7f]", value):
                raise ValueError(f"輸出未完全轉成純文字：{item['id']} {field}")
        if not item["word"] or not item["meaning"] or bool(item["example"]) != bool(item["translation"]):
            raise ValueError(f"必要欄位或例句翻譯不完整：{item['id']}")


def run(download=False, check=False):
    manifest = json.loads((SOURCE / "manifest.json").read_text())
    verify_sources(manifest, download)
    candidates, adjustments, mismatches = import_rows((SOURCE / "notes.csv").read_bytes())
    vocabulary, duplicates = assemble(candidates)
    validate(vocabulary)
    vocabulary_bytes = dumps(vocabulary)
    counts = lambda values: {level: sum(item["level"] == level for item in values) for level in LEVELS}
    readings = defaultdict(set)
    for item in vocabulary:
        readings[item["word"]].add(item["kana"])
    audit = {
        "schemaVersion": 1,
        "source": manifest,
        "scope": "依上游社群整理的 N5–N1 參考詞彙；不是 JLPT 官方清單，亦不保證涵蓋考試全部詞彙。",
        "rawCount": len(candidates), "rawByLevel": counts(candidates),
        "uniqueCount": len(vocabulary), "uniqueByLevel": counts(vocabulary),
        "removedDuplicateRows": len(candidates) - len(vocabulary),
        "duplicateGroupCount": len(duplicates), "duplicates": duplicates,
        "missingRequiredFields": [],
        "missingExamples": [{"id": item["id"], "word": item["word"], "level": item["level"], "sourceId": item["sourceId"]} for item in vocabulary if not item["example"]],
        "missingExampleReason": "上游只提供關聯詞／反義詞，沒有例句或用語示例；保留空字串，不自行生成。",
        "readingAdjustmentCount": len(adjustments), "readingAdjustments": adjustments,
        "deckTagLevelMismatches": mismatches,
        "homographsWithDifferentReadings": [{"word": word, "readings": sorted(values)} for word, values in sorted(readings.items()) if len(values) > 1],
        "fieldMapping": {"word": "column 4, remove Anki furigana and spacing", "kana": "column 7, or kana word for loanword etymology", "meaning": "column 9 (zh-Hant)", "example": "first unlabelled/example item in columns 13/19/25/31", "translation": "matching zh-Hant column 16/22/28/34", "sourceId": "column 3", "level": "column 39 tags (deck level cross-checked)"},
        "deduplication": "NFC 正規化並去除詞形的 Anki 注音後，以 word + kana 合併；保留最低難度、所有不同釋義、各來源級別與識別碼。同形異讀分開保留。",
        "mediaImported": False, "upstreamCodeExecuted": False,
        "vocabularySha256": digest(vocabulary_bytes), "vocabularyBytes": len(vocabulary_bytes),
    }
    outputs = {ROOT / "data/vocabulary.json": vocabulary_bytes, ROOT / "docs/vocabulary-audit.json": dumps(audit)}
    for path, data in outputs.items():
        if check:
            if not path.exists() or path.read_bytes() != data:
                raise ValueError(f"產物與可重跑結果不一致：{path}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    print(json.dumps({"mode": "check" if check else "import", "rawCount": audit["rawCount"], "uniqueCount": audit["uniqueCount"], "byLevel": audit["uniqueByLevel"], "duplicateGroups": len(duplicates), "missingExamples": len(audit["missingExamples"]), "readingAdjustments": len(adjustments), "sha256": audit["vocabularySha256"]}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true", help="下載缺少的固定版本來源，並驗證 SHA-256")
    parser.add_argument("--check", action="store_true", help="重新計算並逐位元組比對產物，不覆寫")
    options = parser.parse_args()
    run(options.download, options.check)
