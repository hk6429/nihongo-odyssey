import {normalize,acceptedReadings} from './engine.js';
export function readingCue(word,vocabulary){return vocabulary.some(other=>other.id!==word.id&&other.meaning===word.meaning)?word.word:'';}
export function distractorPool(word,vocabulary){return vocabulary.filter(other=>other.level===word.level&&other.meaning!==word.meaning&&!acceptedReadings(word).some(k=>acceptedReadings(other).includes(k)));}
