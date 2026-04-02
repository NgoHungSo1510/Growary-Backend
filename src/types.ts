// Shared type definitions — prevents circular imports between routes and utils

export interface GrantedRewards {
    coins: number;
    gachaTickets: number;
    items: string[];
    levelUps: number[];
}
