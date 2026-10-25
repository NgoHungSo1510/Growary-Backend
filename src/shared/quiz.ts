// Shared Quiz Types - Growary Monorepo

export type QuizDifficulty = 'easy' | 'medium' | 'hard';
export type QuizEventStatus = 'upcoming' | 'active' | 'completed';
export type QuizAttemptEndReason = 'finished' | 'expired';

export interface QuizTopicDTO {
    _id: string;
    name: string;
    description: string;
    colorAccent: string;
    iconName: string;
    isActive: boolean;
}

export interface QuizTopicAdminDTO extends QuizTopicDTO {
    questionCount: number;
}

export interface QuizEventDTO {
    _id: string;
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    status: QuizEventStatus;
    colorBg: string;
    colorIcon: string;
    iconName: string;
    rewardPerCorrect: number;
    maxAttemptsPerUser: number;
    attemptCooldownHours: number;
    questionsPerAttempt: number;
}

export interface QuizQuestionPublic {
    _id: string;
    question: string;
    options: string[];
    difficulty: QuizDifficulty;
}

export interface QuizQuestionAdminDTO extends QuizQuestionPublic {
    topic: string | Pick<QuizTopicDTO, '_id' | 'name' | 'colorAccent'>;
    correctIndex: number;
}

export interface QuizSessionDTO {
    attemptId: string;
    topic: QuizTopicDTO;
    questions: QuizQuestionPublic[];
    currentIndex: number;
    streakCount: number;
    questionTimeSec: number;
    resumed: boolean;
    expiresAt: string;
}

export interface QuizStatusResponse {
    hasActiveEvent: boolean;
    event: QuizEventDTO | null;
    attemptsLeft: number;
    nextRechargeAt: string | null;
    inProgressAttempt: QuizSessionDTO | null;
}

export interface QuizAnswerPayload {
    attemptId: string;
    questionId: string;
    selectedIndex: number;
    timeSpent: number;
}

export interface QuizAnswerResult {
    isCorrect: boolean;
    correctIndex: number;
    isTimeout: boolean;
    streakCount: number;
    speedBonusCoins: number;
    streakBonusCoins: number;
    alreadyAnswered: boolean;
}

export interface QuizCompleteResult {
    totalCorrect: number;
    totalQuestions: number;
    baseCoins: number;
    speedBonusCoins: number;
    streakBonusCoins: number;
    coinsEarned: number;
    xpEarned: number;
    maxStreak: number;
    speedAnswerCount: number;
    score: number;
    perfectBonus: { tickets: number; message: string } | null;
    levelUps: number[];
    endReason: QuizAttemptEndReason;
    alreadyCompleted: boolean;
}

export interface QuizLeaderboardEntry {
    userId: string;
    username: string;
    avatarUrl?: string;
    totalScore: number;
    attemptsCount: number;
    bestStreak: number;
    rank: number;
}

export interface QuizLeaderboardResponse {
    eventId: string;
    entries: QuizLeaderboardEntry[];
    currentUser: QuizLeaderboardEntry | null;
}

export interface QuizHistoryItem {
    _id: string;
    topic: Pick<QuizTopicDTO, 'name' | 'colorAccent' | 'iconName'> | null;
    eventTitle: string;
    totalCorrect: number;
    totalQuestions: number;
    coinsEarned: number;
    score: number;
    completedAt: string;
}
