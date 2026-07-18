export const AUTO_BIOME_PRIORITY_IDS = {
    guildCompetition: 'guildCompetition',
    personalCompetition: 'personalCompetition',
    arcaneSurge: 'arcaneSurge',
    goldBreeze: 'goldBreeze',
    dailyQuest: 'dailyQuest',
    weightedExperience: 'weightedExperience',
};

export const AUTO_BIOME_PRIORITY_OPTIONS = [
    {
        id: AUTO_BIOME_PRIORITY_IDS.guildCompetition,
        label: '公会赛',
    },
    {
        id: AUTO_BIOME_PRIORITY_IDS.personalCompetition,
        label: '个人赛',
    },
    {
        id: AUTO_BIOME_PRIORITY_IDS.arcaneSurge,
        label: '奥术涌动',
    },
    {
        id: AUTO_BIOME_PRIORITY_IDS.goldBreeze,
        label: '金风',
    },
    {
        id: AUTO_BIOME_PRIORITY_IDS.dailyQuest,
        label: '每日任务',
    },
    {
        id: AUTO_BIOME_PRIORITY_IDS.weightedExperience,
        label: '加权经验对比',
    },
];

export const DEFAULT_AUTO_BIOME_PRIORITY_ORDER =
    AUTO_BIOME_PRIORITY_OPTIONS.map(({ id }) => id);

const AUTO_BIOME_PRIORITY_ID_SET = new Set(DEFAULT_AUTO_BIOME_PRIORITY_ORDER);

export function normalizeAutoBiomePriorityOrder(priorityOrder) {
    if (!Array.isArray(priorityOrder)) {
        return [...DEFAULT_AUTO_BIOME_PRIORITY_ORDER];
    }

    const normalizedOrder = [];

    for (const priorityId of priorityOrder) {
        if (
            AUTO_BIOME_PRIORITY_ID_SET.has(priorityId) &&
            !normalizedOrder.includes(priorityId)
        ) {
            normalizedOrder.push(priorityId);
        }
    }

    for (const priorityId of DEFAULT_AUTO_BIOME_PRIORITY_ORDER) {
        if (!normalizedOrder.includes(priorityId)) {
            normalizedOrder.push(priorityId);
        }
    }

    return normalizedOrder;
}

export function getAutoBiomeDecisionOrder(priorityOrder) {
    const normalizedOrder = normalizeAutoBiomePriorityOrder(priorityOrder);
    const weightedExperienceIndex = normalizedOrder.indexOf(
        AUTO_BIOME_PRIORITY_IDS.weightedExperience,
    );

    return normalizedOrder.slice(0, weightedExperienceIndex + 1);
}

export function isAutoBiomePriorityEnabled(priorityOrder, priorityId) {
    if (priorityId === AUTO_BIOME_PRIORITY_IDS.weightedExperience) {
        return true;
    }

    return getAutoBiomeDecisionOrder(priorityOrder).includes(priorityId);
}
