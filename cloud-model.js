import {initial,restore,mergeCloudProgress} from './engine.js';
export const blankSnapshot=initial;
export const cleanSnapshot=value=>restore(value,{strict:true});
export const learnedCount=value=>value.completed.length;
export const mergeSnapshots=mergeCloudProgress;

export const learnedKeys=value=>value.completed;
