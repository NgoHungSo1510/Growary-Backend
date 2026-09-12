export interface VipTierConfig {
  tier: number;
  name: string;
  minSpending: number;
  cashbackPercent: number;
  color: string;
  icon?: string;
}

const DEFAULT_VIP_TIERS: VipTierConfig[] = [
  { tier: 0, name: 'Lữ Khách', minSpending: 0, cashbackPercent: 0, color: '#9E9E9E', icon: '🚶' },
  { tier: 1, name: 'Thương Nhân', minSpending: 30000, cashbackPercent: 1, color: '#8D6E63', icon: '💼' },
  { tier: 2, name: 'Thương Nhân Giàu', minSpending: 80000, cashbackPercent: 2, color: '#795548', icon: '💰' },
  { tier: 3, name: 'Hào Phú', minSpending: 150000, cashbackPercent: 3, color: '#78909C', icon: '🎩' },
  { tier: 4, name: 'Quý Tộc', minSpending: 250000, cashbackPercent: 5, color: '#90A4AE', icon: '🏅' },
  { tier: 5, name: 'Bá Tước', minSpending: 370000, cashbackPercent: 6, color: '#FFD54F', icon: '🥉' },
  { tier: 6, name: 'Hầu Tước', minSpending: 500000, cashbackPercent: 8, color: '#FFC107', icon: '🥈' },
  { tier: 7, name: 'Công Tước', minSpending: 640000, cashbackPercent: 10, color: '#00BCD4', icon: '🥇' },
  { tier: 8, name: 'Vương Tôn', minSpending: 780000, cashbackPercent: 12, color: '#26C6DA', icon: '🌟' },
  { tier: 9, name: 'Lãnh Chúa', minSpending: 870000, cashbackPercent: 14, color: '#E91E63', icon: '🏰' },
  { tier: 10, name: 'Hoàng Thân', minSpending: 940000, cashbackPercent: 17, color: '#AB47BC', icon: '👑' },
  { tier: 11, name: 'Hoàng Gia', minSpending: 1000000, cashbackPercent: 20, color: '#F9A825', icon: '💎' },
];

const DEFAULT_RANK_UP_GIFTS: Record<number, { coins: number; gachaTickets: number }> = {
  1: { coins: 300, gachaTickets: 0 },
  2: { coins: 600, gachaTickets: 0 },
  3: { coins: 1000, gachaTickets: 1 },
  4: { coins: 2000, gachaTickets: 1 },
  5: { coins: 3500, gachaTickets: 2 },
  6: { coins: 5000, gachaTickets: 2 },
  7: { coins: 8000, gachaTickets: 3 },
  8: { coins: 12000, gachaTickets: 3 },
  9: { coins: 18000, gachaTickets: 5 },
  10: { coins: 25000, gachaTickets: 5 },
  11: { coins: 40000, gachaTickets: 10 },
};

export async function getVipTiersConfig(): Promise<VipTierConfig[]> {
  const { SystemConfig } = await import('../models');
  const config = await SystemConfig.findOne({ key: 'vip_tiers' });
  if (config) {
    try {
      const parsed = JSON.parse(config.value) as Partial<VipTierConfig>[];
      return parsed.map((p, index) => {
        const defaultTier = DEFAULT_VIP_TIERS[index] || DEFAULT_VIP_TIERS[0];
        return {
          tier: p.tier ?? defaultTier.tier,
          name: p.name ?? defaultTier.name,
          minSpending: p.minSpending ?? defaultTier.minSpending,
          cashbackPercent: p.cashbackPercent ?? defaultTier.cashbackPercent,
          color: (p.color && p.color.startsWith('#')) ? p.color : defaultTier.color,
          icon: (p.icon && p.icon.trim() !== '') ? p.icon : defaultTier.icon,
        };
      });
    } catch (e) {}
  }
  return DEFAULT_VIP_TIERS;
}

export async function getRankUpGiftsConfig(): Promise<Record<number, { coins: number; gachaTickets: number }>> {
  const { SystemConfig } = await import('../models');
  const config = await SystemConfig.findOne({ key: 'rank_up_gifts' });
  if (config) {
    try {
      return JSON.parse(config.value);
    } catch (e) {}
  }
  return DEFAULT_RANK_UP_GIFTS;
}

export async function calcVipTier(totalCoinsSpent: number): Promise<number> {
  const tiers = await getVipTiersConfig();
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (totalCoinsSpent >= tiers[i].minSpending) {
      return tiers[i].tier;
    }
  }
  return 0;
}

export async function getVipConfig(tier: number): Promise<VipTierConfig> {
  const tiers = await getVipTiersConfig();
  const validTier = Math.max(0, Math.min(tiers.length - 1, tier));
  return tiers[validTier];
}


export async function calcCashback(actualPrice: number, tier: number): Promise<number> {
  const config = await getVipConfig(tier);
  return Math.floor(actualPrice * config.cashbackPercent / 100);
}
