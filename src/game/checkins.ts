import type {Checkin,CheckinTask,Settings} from './types';

export const taskStatusLabels:Record<CheckinTask['status'],string>={unsubmitted:'未提交',pending:'待确认',approved:'已通过',rejected:'待补做'};
export const checkinStatusLabels:Record<Checkin['status'],string>={pending:'待审核',partial:'部分通过',approved:'已通过',rejected:'待补充'};
export function checkinTasks(checkin:Checkin,settings:Settings):CheckinTask[]{
  return checkin.review?.tasks??checkin.taskIds.map(id=>({id,name:settings.tasks.find(t=>t.id===id)?.name??id,status:checkin.status==='approved'?'approved':checkin.status==='rejected'?'rejected':'pending',submittedAt:checkin.submittedAt,reason:checkin.reason}));
}
export function checkinReward(checkin:Checkin){return checkin.review?checkin.review.settled+checkin.review.streakReward:checkin.granted;}
export function qualifies(checkin:Checkin){return checkin.review?checkin.review.tasks.some(t=>t.status==='approved'):checkin.status==='approved';}
