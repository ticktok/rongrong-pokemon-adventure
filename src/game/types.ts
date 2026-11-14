export type Role = 'parent' | 'child';
export interface Species { id:number; name:string; english:string; types:string[]; stats:Record<string,number>; captureRate:number; generation:string; chainId:number }
export interface Evolution { from:number; to:number; level:number }
export interface Move { id:string; name:string; type:string; power:number; accuracy:number; level:number }
export interface PartnerBox {id:string;name:string;slots:(string|null)[]}
export interface SharedReward {base:number;partnerIds:string[];rate:0.5|1}
export interface Partner { id:string; speciesId:number; exp:number; level:number; moves:string[]; sealed?:number; sealCountedDates?:string[]; acquiredAt:string }
export interface GrowthEntry { seq:number; at:string; partnerId:string; fromSpecies:number; toSpecies:number; fromExp:number; toExp:number; fromLevel:number; toLevel:number }
export interface GrowthHistory { lastSeq:number; readThrough:number; entries:GrowthEntry[] }
export interface BattleFrame { battle:Battle; playerSpecies:number; playerLevel:number }
export type BattleEvent =
  | {kind:'attack'; side:'own'|'enemy'; moveId:string; damage:number; effectiveness:number; bonus:number; before:BattleFrame; after:BattleFrame}
  | {kind:'faint'|'sendout'|'outcome'|'capture'; side:'own'|'enemy'; message:string; before:BattleFrame; after:BattleFrame};
export interface BattlePlayback { battleId:string; events:BattleEvent[] }
export interface Word { id:string; word:string; meaning:string; topic:string; level:number; example:string; active?:boolean }
export interface Npc { id:string; name:string; regionId:string; x:number; y:number; kind:'family'|'classmate'; line:string; quest:string }
export interface Region { id:string; name:string; subtitle:string; biome:string; color:string; badge:string; leader:string; level:number; gift:number; boss:number[]; requiredBadges:number; description:string }
export interface Question { id:string; wordId:string; prompt:string; options:{id:string;text:string}[]; correctOptionId:string; wrong:boolean; firstCorrect?:boolean; kind:'daily'|'review'|'battle'|'catch'|'npc'; explanation:string; word:string; example:string; moveId?:string; npcId?:string; learningPool?:'new'|'due'|'familiar' }
export type PublicQuestion = Omit<Question,'correctOptionId'|'wordId'|'explanation'|'word'|'example'|'learningPool'> & { explanation?:string; word?:string; example?:string };
export interface Battle { id:string; kind:'wild'|'gym'; regionId:string; enemy:number; enemyLevel:number; enemyHp:number; enemyMaxHp:number; playerId:string; playerHp:number; playerMaxHp:number; teamHp:Record<string,number>; enemyIndex:number; enemies:number[]; combo:number; balls:number; turn:number; log:string[]; status:'active'|'won'|'lost'|'caught'|'fled' }
export interface CheckinTask { id:string; name:string; status:'unsubmitted'|'pending'|'approved'|'rejected'; submittedAt?:string; reviewedAt?:string; reason?:string }
export interface CheckinRules { baseExp:number; fastMultiplier:number; fastDeadline:string; englishPerQuestion:number; streakBonus:number }
export interface CheckinReview { rewardMode?:'shared-half'; tasks:CheckinTask[]; rules:CheckinRules; submissionVersion:number; settled:number; streakReward:number }
export interface Checkin { date:string; taskIds:string[]; status:'pending'|'partial'|'approved'|'rejected'; submittedAt:string; englishCorrect:number; granted:number; reason?:string; reviewedAt?:string; review?:CheckinReview }
export interface MemoryCard { due:string; stability:number; difficulty:number; elapsed_days:number; scheduled_days:number; learning_steps:number; reps:number; lapses:number; state:0|1|2|3; last_review?:string }
export interface Mastery { correct:number; wrong:number; due:string; stage:number; reviewStarted?:string; lastAnsweredOn?:string; fsrs?:{algorithm:'fsrs-6'; card:MemoryCard; scheduledOn:string; lastRating:'good'|'again'} }
export interface Daily { baseExpUsed?:number; date:string; questions:number; correct:number; completedIds:string[]; encounters:number; expGranted:number; practiceFinished:boolean; goal?:number; gymStarts?:number; newWordCount?:number }
export interface Settings { baseExp:number; dailyCap:number; captureLimit:number; attackBonus:number; comboBonus:number; catchBonus:number; fastMultiplier:number; fastDeadline:string; streakBonus:number; englishPerQuestion:number; sealDays:number; maxWordLevel:number; weekdayPassDate:string; tasks:{id:string;name:string;active:boolean}[] }
export interface AdventureAccess { regionOpen:boolean; regionOpensOn?:string; regionReason:string; gymAvailable:boolean; gymEligibleOn?:string; gymReason:string }
export interface GymProgress { initializedOn:string; firstWins:Record<string,string>; legacyOpenRegions:string[] }
export interface GameState {
  growth?:GrowthHistory;
  boxes?:PartnerBox[];
  discoveries?:string[];
  sharedRewards?:SharedReward[];
  sharedUnallocated?:number;
  expHalfRemainders?:Record<string,number>;
  gymProgress?:GymProgress;
  recentWordIds?:string[];
  schemaVersion:1; nickname:string; realName:string; started:boolean; partners:Partner[]; team:string[]; seen:number[]; caught:number[]; badges:string[];
  position:{regionId:string;x:number;y:number}; battle:Battle|null; question:Question|null; daily:Daily; checkins:Checkin[]; mastery:Record<string,Mastery>;
  carry:number; carryTargets:string[]; carryByPartner?:Record<string,number>; unallocatedExp?:number; streakRewardsSettled?:number; settings:Settings; npcs:Npc[]; customWords:Word[]; disabledWordIds:string[]; npcCompleted:string[]; events:{date:string;message:string}[];
}
export interface PublicState extends Omit<GameState,'question'|'customWords'|'disabledWordIds'|'realName'|'recentWordIds'> {
  contentMode?:'own'|'follow';
  adventureAccess:Record<string,AdventureAccess>; gymRemaining:number;
  question:PublicQuestion|null; realName?:string; words?:Word[]; reviewWords:(Pick<Word,'id'|'word'|'meaning'>&{reviewable?:boolean})[]; reviewCount:number; claimableExp:number; wordCount:number; role:Role; revision:number; canBattle:boolean; today:string;
}
export interface DailyFeedback { questionId:string; word:string; explanation:string; example:string; completed:number; correct:number; date:string; goal?:number; rewardMessage?:string }
export interface ActionResult { message:string; effect?:'correct'|'wrong'|'attack'|'catch'|'win'|'lose'|'level'|'evolve'|'approve'|'gift'; dailyFeedback?:DailyFeedback; battlePlayback?:BattlePlayback }
export interface ApiResponse { ok:boolean; state?:PublicState; result?:ActionResult; error?:string; export?:GameState }
export interface GameCommand { type:string; operationId:string; payload:Record<string,unknown>; expectedUid?:string }
