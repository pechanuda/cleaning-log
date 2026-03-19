export const TASK_SIZES = ["XS", "S", "M", "L"] as const;

export type TaskSize = (typeof TASK_SIZES)[number];

export type Member = {
  id: string;
  name: string;
};

export type Task = {
  id: string;
  name: string;
  size: TaskSize;
  points: number;
};

export type DayEntry = {
  date: string;
  memberId: string;
  memberName: string;
  task1Id: string | null;
  task2Id: string | null;
};

export type ScoreboardRow = {
  memberId: string;
  memberName: string;
  points: number;
};

export type MonthDay = {
  date: string;
  dayOfMonth: number;
  weekdayShort: string;
  entries: DayEntry[];
};

export type MonthViewResponse = {
  householdName: string;
  selectedMonth: string;
  members: Member[];
  tasks: Task[];
  days: MonthDay[];
  scoreboard: ScoreboardRow[];
};
