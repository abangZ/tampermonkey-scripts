import { getBaitIdForBiome } from './auto-bait.js';
import {
    AUTO_BIOME_PRIORITY_IDS,
    getAutoBiomeDecisionOrder,
    isAutoBiomePriorityEnabled,
    normalizeAutoBiomePriorityOrder,
} from './auto-biome-priority.js';

const WEATHER_LABELS = {
    clear: '晴朗',
    rain: '雨天',
    windy: '大风',
    foggy: '大雾',
    heatwave: '热浪',
    storm: '暴风',
    blight: '枯萎',
    gold_breeze: '金风',
    arcane_surge: '奥术涌动',
};
const COMPETITION_HOOK_DEBOUNCE = 1000;
const DAILY_QUEST_FALLBACK_FRESHNESS = 60 * 60 * 1000;
const ARCANE_SURGE_WEATHER = 'arcane_surge';
const GOLD_BREEZE_WEATHER = 'gold_breeze';
const WEATHER_FALLBACK_FRESHNESS = 60000;

function normalizeBiomeId(value) {
    const biomeId = Number(value);

    return Number.isInteger(biomeId) && biomeId > 0 ? biomeId : null;
}

function normalizeXpBonus(value) {
    const xpBonus = Number(value);

    return Number.isFinite(xpBonus) ? xpBonus : 0;
}

function normalizeQuestMetadata(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value;
    }

    if (typeof value === 'string') {
        try {
            const metadata = JSON.parse(value);

            return metadata &&
                typeof metadata === 'object' &&
                !Array.isArray(metadata)
                ? metadata
                : {};
        } catch {
            return {};
        }
    }

    return {};
}

function isQuestCompleted(quest) {
    if (
        quest?.completed === true ||
        quest?.completed === 1 ||
        quest?.completed === '1'
    ) {
        return true;
    }

    const currentProgress = Number(quest?.current_progress);
    const targetAmount = Number(quest?.target_amount);

    return (
        Number.isFinite(currentProgress) &&
        Number.isFinite(targetAmount) &&
        targetAmount > 0 &&
        currentProgress >= targetAmount
    );
}

function getDailyQuestSource(payload) {
    if (Array.isArray(payload?.quests?.daily)) {
        return payload.quests.daily;
    }

    if (Array.isArray(payload?.daily)) {
        return payload.daily;
    }

    return null;
}

export function normalizeDailyQuests(payload) {
    const source = getDailyQuestSource(payload);

    if (!source) {
        return [];
    }

    return source
        .filter((quest) => quest && typeof quest === 'object')
        .map((quest) => {
            const metadata = normalizeQuestMetadata(quest.metadata);
            const weatherRule = String(
                metadata.weather_rule ??
                    metadata.weatherRule ??
                    quest.weather_rule ??
                    quest.weatherRule ??
                    '',
            ).trim();

            return {
                completed: isQuestCompleted(quest),
                expiresAt: String(quest.expires_at ?? '').trim() || null,
                id: quest.id ?? quest.quest_template_id ?? null,
                targetBiome: normalizeBiomeId(
                    metadata.targetBiome ??
                        metadata.target_biome ??
                        quest.targetBiome ??
                        quest.target_biome,
                ),
                weatherRule: weatherRule || null,
            };
        });
}

function isDailyQuestActive(quest, now) {
    if (quest.completed) {
        return false;
    }

    const expiresAt = Date.parse(quest.expiresAt);

    return !Number.isFinite(expiresAt) || expiresAt > now;
}

export function findMatchingDailyQuests({
    biomeId,
    dailyQuests,
    now = Date.now(),
    weather,
}) {
    const normalizedBiomeId = normalizeBiomeId(biomeId);

    if (!normalizedBiomeId || !Array.isArray(dailyQuests)) {
        return [];
    }

    return dailyQuests.filter((quest) => {
        if (!isDailyQuestActive(quest, now)) {
            return false;
        }

        const hasBiomeRule = quest.targetBiome !== null;
        const hasWeatherRule = Boolean(quest.weatherRule);

        if (!hasBiomeRule && !hasWeatherRule) {
            return false;
        }

        return (
            (!hasBiomeRule || quest.targetBiome === normalizedBiomeId) &&
            (!hasWeatherRule || quest.weatherRule === weather)
        );
    });
}

export function normalizeWeatherByBiome(payload) {
    const source = payload?.weather ?? payload;

    if (!source || typeof source !== 'object' || Array.isArray(source)) {
        return {};
    }

    const weatherByBiome = {};

    for (const [rawBiomeId, rawWeather] of Object.entries(source)) {
        const biomeId = normalizeBiomeId(rawBiomeId);

        if (!biomeId || !rawWeather || typeof rawWeather !== 'object') {
            continue;
        }

        weatherByBiome[biomeId] = {
            weather: String(rawWeather.weather ?? 'clear'),
            xpBonus: normalizeXpBonus(rawWeather.xpBonus),
        };
    }

    return weatherByBiome;
}

export function normalizeWeatherResponse(pathname, payload) {
    if (pathname === '/api/game/weather' || pathname === 'stream') {
        return normalizeWeatherByBiome(payload);
    }

    const match = String(pathname).match(/^\/api\/game\/weather\/(\d+)$/);
    const biomeId = normalizeBiomeId(match?.[1]);
    const weather =
        payload?.weather && typeof payload.weather === 'object'
            ? payload.weather
            : payload;

    if (!biomeId || !weather || typeof weather !== 'object') {
        return {};
    }

    return {
        [biomeId]: {
            weather: String(weather.weather ?? 'clear'),
            xpBonus: normalizeXpBonus(weather.xpBonus),
        },
    };
}

export function getBiomeScore(biomeId, xpBonus, biomeWeight) {
    const normalizedBiomeId = normalizeBiomeId(biomeId) ?? 1;

    return (
        normalizeXpBonus(xpBonus) +
        (normalizedBiomeId - 1) * normalizeXpBonus(biomeWeight)
    );
}

export function findAvailableBaitForBiome(player, biomeId) {
    const inventory = player?.baitInventory;

    if (!inventory || typeof inventory !== 'object') {
        return null;
    }

    const currentGrade = String(player.equippedBait ?? '').match(
        /^bait_\d+_(low|medium|high|super)$/,
    )?.[1];
    const grades =
        currentGrade && currentGrade !== 'low'
            ? [currentGrade, 'low']
            : ['low'];

    for (const grade of grades) {
        const baitId = `bait_${biomeId}_${grade}`;

        if (Number(inventory[baitId]) > 0) {
            return baitId;
        }
    }

    for (const grade of ['medium', 'high', 'super']) {
        const baitId = `bait_${biomeId}_${grade}`;

        if (Number(inventory[baitId]) > 0) {
            return baitId;
        }
    }

    return null;
}

export function resolveCompetitionBiomes({
    derbyResponse,
    guildResponse,
    tournamentResponse,
    tournamentStandingsResponse,
}) {
    const activeTournament = tournamentResponse?.active;
    const activeDerby = derbyResponse?.active;
    const guildId = normalizeBiomeId(guildResponse?.guild?.guild_id);
    const standings = Array.isArray(tournamentStandingsResponse?.standings)
        ? tournamentStandingsResponse.standings
        : [];
    const guildRegistered =
        activeTournament?.is_registered === true ||
        (guildId !== null &&
            standings.some(
                (entry) => normalizeBiomeId(entry?.guild_id) === guildId,
            ));

    return {
        guildTournamentBiomeId: guildRegistered
            ? normalizeBiomeId(activeTournament?.biome_id)
            : null,
        personalDerbyBiomeId:
            activeDerby?.is_registered === true
                ? normalizeBiomeId(activeDerby.biome_id)
                : null,
    };
}

export function selectBestBiome({
    biomeWeight,
    competitionBiomes,
    dailyQuests = [],
    now = Date.now(),
    player,
    priorityOrder,
    weatherByBiome,
}) {
    const decisionOrder = getAutoBiomeDecisionOrder(priorityOrder);
    const usesDailyQuests = decisionOrder.includes(
        AUTO_BIOME_PRIORITY_IDS.dailyQuest,
    );
    const unlockedBiomes = Array.isArray(player?.unlockedBiomes)
        ? player.unlockedBiomes
        : [player?.currentBiome ?? 1];
    const candidates = [];

    for (const rawBiomeId of unlockedBiomes) {
        const biomeId = normalizeBiomeId(rawBiomeId);
        const weather = weatherByBiome?.[biomeId];

        if (!biomeId || !weather) {
            continue;
        }

        const dailyQuestMatchCount = usesDailyQuests
            ? findMatchingDailyQuests({
                  biomeId,
                  dailyQuests,
                  now,
                  weather: weather.weather,
              }).length
            : 0;

        const score = getBiomeScore(biomeId, weather.xpBonus, biomeWeight);

        candidates.push({
            baitId: findAvailableBaitForBiome(player, biomeId),
            biomeId,
            dailyQuestMatchCount,
            priorityValues: {
                [AUTO_BIOME_PRIORITY_IDS.guildCompetition]:
                    biomeId ===
                    normalizeBiomeId(competitionBiomes?.guildTournamentBiomeId)
                        ? 1
                        : 0,
                [AUTO_BIOME_PRIORITY_IDS.personalCompetition]:
                    biomeId ===
                    normalizeBiomeId(competitionBiomes?.personalDerbyBiomeId)
                        ? 1
                        : 0,
                [AUTO_BIOME_PRIORITY_IDS.arcaneSurge]:
                    weather.weather === ARCANE_SURGE_WEATHER ? 1 : 0,
                [AUTO_BIOME_PRIORITY_IDS.goldBreeze]:
                    weather.weather === GOLD_BREEZE_WEATHER ? 1 : 0,
                [AUTO_BIOME_PRIORITY_IDS.dailyQuest]:
                    dailyQuestMatchCount > 0 ? 1 : 0,
                [AUTO_BIOME_PRIORITY_IDS.weightedExperience]: score,
            },
            score,
            weather: weather.weather,
            xpBonus: weather.xpBonus,
        });
    }

    candidates.sort((left, right) => {
        for (const priorityId of decisionOrder) {
            const difference =
                right.priorityValues[priorityId] -
                left.priorityValues[priorityId];

            if (difference !== 0) {
                return difference;
            }
        }

        return right.biomeId - left.biomeId;
    });

    if (candidates.length === 0) {
        return null;
    }

    const { dailyQuestMatchCount, priorityValues, ...bestBiome } =
        candidates[0];
    const selectionPriority =
        decisionOrder.find(
            (priorityId) =>
                priorityId === AUTO_BIOME_PRIORITY_IDS.weightedExperience ||
                priorityValues[priorityId] > 0,
        ) ?? AUTO_BIOME_PRIORITY_IDS.weightedExperience;

    return {
        ...bestBiome,
        selectionPriority,
        ...(selectionPriority === AUTO_BIOME_PRIORITY_IDS.guildCompetition
            ? { competitionType: 'guild' }
            : {}),
        ...(selectionPriority === AUTO_BIOME_PRIORITY_IDS.personalCompetition
            ? { competitionType: 'personal' }
            : {}),
        ...(selectionPriority === AUTO_BIOME_PRIORITY_IDS.dailyQuest
            ? { dailyQuestCount: dailyQuestMatchCount }
            : {}),
    };
}

function getBiomeName(biomeId) {
    return (
        String(window.BIOMES?.[biomeId]?.name ?? '').trim() || `地图 ${biomeId}`
    );
}

function getWeatherLabel(weather) {
    return WEATHER_LABELS[weather] ?? weather ?? '未知天气';
}

function formatBiomeTarget(target) {
    return `[B${target.biomeId}] ${getBiomeName(target.biomeId)}`;
}

function formatTargetSummary(target) {
    const weatherLabel = getWeatherLabel(target.weather);
    const signedXpBonus =
        target.xpBonus > 0 ? `+${target.xpBonus}` : String(target.xpBonus);

    const priorityLabel =
        target.selectionPriority === AUTO_BIOME_PRIORITY_IDS.guildCompetition
            ? '公会赛优先 · '
            : target.selectionPriority ===
                AUTO_BIOME_PRIORITY_IDS.personalCompetition
              ? '个人赛优先 · '
              : target.selectionPriority === AUTO_BIOME_PRIORITY_IDS.arcaneSurge
                ? '奥术涌动优先 · '
                : target.selectionPriority ===
                    AUTO_BIOME_PRIORITY_IDS.goldBreeze
                  ? '金风优先 · '
                  : target.selectionPriority ===
                      AUTO_BIOME_PRIORITY_IDS.dailyQuest
                    ? '每日任务优先 · '
                    : '';

    return `${priorityLabel}${formatBiomeTarget(target)} · ${weatherLabel} ${signedXpBonus}% · 评分 ${target.score}`;
}

function getErrorMessage(error) {
    return String(error?.message ?? error ?? '未知错误');
}

function getPriorityState(priorityOrder) {
    const normalizedPriorityOrder =
        normalizeAutoBiomePriorityOrder(priorityOrder);

    return {
        dailyQuestEnabled: isAutoBiomePriorityEnabled(
            normalizedPriorityOrder,
            AUTO_BIOME_PRIORITY_IDS.dailyQuest,
        ),
        goldBreezeEnabled: isAutoBiomePriorityEnabled(
            normalizedPriorityOrder,
            AUTO_BIOME_PRIORITY_IDS.goldBreeze,
        ),
        guildCompetitionEnabled: isAutoBiomePriorityEnabled(
            normalizedPriorityOrder,
            AUTO_BIOME_PRIORITY_IDS.guildCompetition,
        ),
        normalizedPriorityOrder,
        personalCompetitionEnabled: isAutoBiomePriorityEnabled(
            normalizedPriorityOrder,
            AUTO_BIOME_PRIORITY_IDS.personalCompetition,
        ),
    };
}

async function autoEquipForBiome(
    player,
    target,
    { skipBait = false, skipRod = false } = {},
) {
    const api = window.ApiService;

    if (!skipBait && target.baitId && target.baitId !== player.equippedBait) {
        try {
            await api.equipBait(target.baitId);
        } catch (error) {
            console.warn('[自动换图] 无法自动装备目标地图鱼饵：', error);
        }
    }

    if (skipRod) {
        return;
    }

    const currentRod = String(player.equippedRod ?? 'rod_default');

    if (
        !currentRod.startsWith('rod_biome_') ||
        currentRod === `rod_biome_${target.biomeId}`
    ) {
        return;
    }

    const ownedRods = Array.isArray(player.ownedRods) ? player.ownedRods : [];
    const targetBiomeRod = `rod_biome_${target.biomeId}`;
    const fallbackRods = [
        'rod_strength',
        'rod_luck',
        'rod_relic',
        'rod_treasure',
        'rod_default',
    ];
    const nextRod = ownedRods.includes(targetBiomeRod)
        ? targetBiomeRod
        : (fallbackRods.find((rodId) => ownedRods.includes(rodId)) ??
          'rod_default');

    try {
        await api.equipRod(nextRod);
    } catch (error) {
        console.warn('[自动换图] 无法自动装备可用鱼竿：', error);
    }
}

function getNextHourlyRefreshDelay(now = new Date()) {
    const nextRefresh = new Date(now);

    nextRefresh.setHours(now.getHours() + 1, 0, 5, 0);
    return Math.max(1000, nextRefresh.getTime() - now.getTime());
}

export function createAutoBiomeController({
    getPlayer,
    getState,
    onBiomeReady,
    onStateChange,
}) {
    let evaluationId = 0;
    let fallbackTimer = null;
    let competitionHookTimer = null;
    let competitionHookPending = false;
    let derbyResponse;
    let guildResponse;
    let tournamentResponse;
    const tournamentStandingsById = new Map();
    let competitionBiomes = {
        guildTournamentBiomeId: null,
        personalDerbyBiomeId: null,
    };
    let competitionStatus = '自动换图开启后检测';
    let competitionUpdatedAt = 0;
    let dailyQuestState = {
        fingerprint: null,
        loadAttempted: false,
        loading: false,
        quests: [],
        status: '自动换图开启后读取',
        updatedAt: 0,
    };
    let lastFullWeatherUpdatedAt = 0;
    let lastUpdatedAt = 0;
    let status = '等待天气数据';
    let switching = false;
    let target = null;
    let weatherByBiome = {};
    let weatherRevision = 0;

    function notifyStateChanged() {
        onStateChange?.();
    }

    function setStatus(nextStatus) {
        status = nextStatus;
        notifyStateChanged();
    }

    function getSnapshot() {
        return {
            autoBiomeCompetitionBiomes: competitionBiomes,
            autoBiomeCompetitionStatus: competitionStatus,
            autoBiomeCompetitionUpdatedAt: competitionUpdatedAt,
            autoBiomeDailyQuestStatus: dailyQuestState.status,
            autoBiomeDailyQuestUpdatedAt: dailyQuestState.updatedAt,
            autoBiomeDailyQuests: dailyQuestState.quests,
            autoBiomeLastUpdatedAt: lastUpdatedAt,
            autoBiomeStatus: status,
            autoBiomeTarget: target,
            autoBiomeWeatherByBiome: weatherByBiome,
        };
    }

    function formatCompetitionStatus(biomes, priorityOrder) {
        const { guildCompetitionEnabled, personalCompetitionEnabled } =
            getPriorityState(priorityOrder);
        const labels = [];

        if (guildCompetitionEnabled && biomes.guildTournamentBiomeId) {
            labels.push(`公会 B${biomes.guildTournamentBiomeId}`);
        }

        if (personalCompetitionEnabled && biomes.personalDerbyBiomeId) {
            labels.push(`个人 B${biomes.personalDerbyBiomeId}`);
        }

        if (!guildCompetitionEnabled && !personalCompetitionEnabled) {
            return '已关闭';
        }

        return labels.length > 0 ? labels.join(' · ') : '暂无已参与的比赛';
    }

    function formatDailyQuestStatus(quests) {
        const labels = quests
            .filter((quest) => isDailyQuestActive(quest, Date.now()))
            .flatMap((quest) => [
                ...(quest.targetBiome ? [`B${quest.targetBiome}`] : []),
                ...(quest.weatherRule
                    ? [getWeatherLabel(quest.weatherRule)]
                    : []),
            ]);
        const uniqueLabels = [...new Set(labels)];

        return uniqueLabels.length > 0
            ? uniqueLabels.join(' · ')
            : '暂无需要匹配地图的未完成任务';
    }

    function updateCompetitionState() {
        competitionBiomes = resolveCompetitionBiomes({
            derbyResponse,
            guildResponse,
            tournamentResponse,
            tournamentStandingsResponse: tournamentStandingsById.get(
                String(tournamentResponse?.active?.id ?? ''),
            ),
        });
        competitionStatus = formatCompetitionStatus(
            competitionBiomes,
            getState?.()?.autoBiomeSettings?.priorityOrder,
        );
        competitionUpdatedAt = Date.now();
        notifyStateChanged();
    }

    function hasCompetitionSnapshot(priorityOrder) {
        const { guildCompetitionEnabled, personalCompetitionEnabled } =
            getPriorityState(priorityOrder);

        if (personalCompetitionEnabled && derbyResponse === undefined) {
            return false;
        }

        if (!guildCompetitionEnabled) {
            return true;
        }

        if (tournamentResponse === undefined) {
            return false;
        }

        const activeTournamentId = tournamentResponse?.active?.id;

        if (!activeTournamentId) {
            return true;
        }

        if (tournamentResponse.active.is_registered === true) {
            return true;
        }

        return (
            guildResponse !== undefined &&
            tournamentStandingsById.has(String(activeTournamentId))
        );
    }

    function scheduleCompetitionEvaluation() {
        competitionHookPending = true;
        window.clearTimeout(competitionHookTimer);
        competitionHookTimer = window.setTimeout(() => {
            competitionHookPending = false;
            void evaluateBestBiome();
        }, COMPETITION_HOOK_DEBOUNCE);
    }

    function handleCompetitionResponse({ pathname, payload }) {
        let matched = true;

        if (pathname === '/api/guild/tournaments/current') {
            tournamentResponse = payload;
        } else if (pathname === '/api/derby/current') {
            derbyResponse = payload;
        } else if (pathname === '/api/guild/my-guild') {
            guildResponse = payload;
        } else {
            const standingsMatch = pathname.match(
                /^\/api\/guild\/tournaments\/([^/]+)\/standings$/,
            );

            if (standingsMatch) {
                tournamentStandingsById.set(standingsMatch[1], payload);
            } else {
                matched = false;
            }
        }

        if (!matched) {
            return false;
        }

        updateCompetitionState();
        scheduleCompetitionEvaluation();
        return true;
    }

    function applyDailyQuestResponse(payload, source) {
        if (!getDailyQuestSource(payload)) {
            return false;
        }

        if (source === 'fetch' && dailyQuestState.loading) {
            return true;
        }

        const quests = normalizeDailyQuests(payload);
        const fingerprint = JSON.stringify(quests);
        const shouldEvaluate =
            dailyQuestState.loading ||
            fingerprint !== dailyQuestState.fingerprint;

        dailyQuestState = {
            fingerprint,
            loadAttempted: true,
            loading: false,
            quests,
            status: formatDailyQuestStatus(quests),
            updatedAt: Date.now(),
        };

        if (shouldEvaluate) {
            notifyStateChanged();
            void evaluateBestBiome();
        }

        return true;
    }

    function handleQuestResponse({ pathname, payload, source = 'fetch' }) {
        if (pathname !== '/api/quests') {
            return false;
        }

        return applyDailyQuestResponse(payload, source);
    }

    async function notifyBiomeReady(biomeId) {
        try {
            await onBiomeReady?.(biomeId);
        } catch (error) {
            console.warn('[自动换图] 切图后的鱼饵检查失败：', error);
        }
    }

    async function loadAllWeather() {
        if (typeof window.ApiService?.getAllBiomeWeather === 'function') {
            return window.ApiService.getAllBiomeWeather();
        }

        const response = await window.fetch('/api/game/weather');

        if (!response.ok) {
            throw new Error(`天气接口返回 ${response.status}`);
        }

        return response.json();
    }

    async function loadDailyQuests() {
        if (typeof window.ApiService?.getQuests === 'function') {
            return window.ApiService.getQuests();
        }

        const response = await window.fetch('/api/quests');

        if (!response.ok) {
            throw new Error(`每日任务接口返回 ${response.status}`);
        }

        return response.json();
    }

    function applyWeather(payload, source, { merge = false } = {}) {
        const nextWeather = normalizeWeatherResponse(
            source === 'request' ? '/api/game/weather' : source,
            payload,
        );

        if (Object.keys(nextWeather).length === 0) {
            return false;
        }

        weatherByBiome = merge
            ? {
                  ...weatherByBiome,
                  ...nextWeather,
              }
            : nextWeather;
        lastUpdatedAt = Date.now();

        if (!merge) {
            lastFullWeatherUpdatedAt = lastUpdatedAt;
        }

        if (source !== 'request') {
            weatherRevision += 1;
        }

        notifyStateChanged();
        void evaluateBestBiome();
        return true;
    }

    function handleWeatherResponse({ pathname, payload, source = 'fetch' }) {
        const responsePath = source === 'stream' ? 'stream' : pathname;

        return applyWeather(payload, responsePath, {
            merge: responsePath !== '/api/game/weather' && source !== 'stream',
        });
    }

    async function refreshWeather() {
        const revisionBeforeRequest = weatherRevision;

        try {
            const payload = await loadAllWeather();

            if (revisionBeforeRequest === weatherRevision) {
                applyWeather(payload, 'request');
            }
        } catch (error) {
            console.warn('[自动换图] 无法读取地图天气：', error);

            if (Object.keys(weatherByBiome).length === 0) {
                setStatus('天气数据读取失败');
            }
        }
    }

    async function refreshDailyQuests() {
        if (dailyQuestState.loading) {
            return;
        }

        dailyQuestState = {
            ...dailyQuestState,
            loadAttempted: true,
            loading: true,
            status:
                dailyQuestState.updatedAt > 0
                    ? '正在更新每日任务'
                    : '正在读取每日任务',
        };
        notifyStateChanged();

        try {
            const payload = await loadDailyQuests();

            if (!applyDailyQuestResponse(payload, 'request')) {
                dailyQuestState = {
                    ...dailyQuestState,
                    loading: false,
                    status:
                        dailyQuestState.updatedAt > 0
                            ? '每日任务响应异常，沿用上次数据'
                            : '每日任务响应异常，按普通地图选择',
                };
                notifyStateChanged();
                void evaluateBestBiome();
            }
        } catch (error) {
            console.warn('[自动换图] 无法读取每日任务：', error);
            dailyQuestState = {
                ...dailyQuestState,
                loading: false,
                status:
                    dailyQuestState.updatedAt > 0
                        ? '每日任务更新失败，沿用上次数据'
                        : '每日任务读取失败，按普通地图选择',
            };
            notifyStateChanged();
            void evaluateBestBiome();
        }
    }

    function scheduleHourlyFallback() {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = window.setTimeout(async () => {
            const refreshes = [];

            if (
                Date.now() - lastFullWeatherUpdatedAt >
                WEATHER_FALLBACK_FRESHNESS
            ) {
                refreshes.push(refreshWeather());
            }

            const { autoBiomeSettings = {} } = getState?.() ?? {};
            const { dailyQuestEnabled } = getPriorityState(
                autoBiomeSettings.priorityOrder,
            );

            if (
                autoBiomeSettings.enabled === true &&
                dailyQuestEnabled &&
                Date.now() - dailyQuestState.updatedAt >
                    DAILY_QUEST_FALLBACK_FRESHNESS
            ) {
                refreshes.push(refreshDailyQuests());
            }

            await Promise.all(refreshes);
            scheduleHourlyFallback();
        }, getNextHourlyRefreshDelay());
    }

    async function evaluateBestBiome() {
        const currentEvaluationId = ++evaluationId;
        const {
            autoBaitSettings = {},
            autoBiomeSettings = {},
            enabled = false,
        } = getState?.() ?? {};
        const {
            dailyQuestEnabled,
            goldBreezeEnabled,
            guildCompetitionEnabled,
            normalizedPriorityOrder,
            personalCompetitionEnabled,
        } = getPriorityState(autoBiomeSettings.priorityOrder);
        const competitionEnabled =
            guildCompetitionEnabled || personalCompetitionEnabled;

        if (!competitionEnabled) {
            competitionStatus = '已关闭';
        } else if (competitionUpdatedAt > 0) {
            competitionStatus = formatCompetitionStatus(
                competitionBiomes,
                normalizedPriorityOrder,
            );
        } else if (competitionStatus === '已关闭') {
            competitionStatus = '自动换图开启后检测';
        }

        if (!dailyQuestEnabled) {
            dailyQuestState.status = '已关闭';
        } else if (dailyQuestState.status === '已关闭') {
            // 仅在从关闭状态重新启用时恢复展示，保留读取中或失败状态。
            dailyQuestState.status =
                dailyQuestState.updatedAt > 0
                    ? formatDailyQuestStatus(dailyQuestState.quests)
                    : '自动换图开启后读取';
        }

        if (!autoBiomeSettings.enabled) {
            target = null;
            competitionStatus = competitionEnabled
                ? '自动换图开启后检测'
                : '已关闭';
            setStatus('未启用');
            return;
        }

        if (!enabled) {
            target = null;
            competitionStatus = competitionEnabled
                ? '脚本启动后检测'
                : '已关闭';
            setStatus('脚本启动后自动选择地图');
            return;
        }

        if (Object.keys(weatherByBiome).length === 0) {
            setStatus('等待天气数据');
            return;
        }

        if (switching) {
            return;
        }

        if (
            competitionEnabled &&
            (!hasCompetitionSnapshot(normalizedPriorityOrder) ||
                competitionHookPending)
        ) {
            competitionStatus = '等待游戏比赛轮询';
            setStatus('等待游戏比赛数据');
            return;
        }

        if (dailyQuestEnabled && dailyQuestState.loading) {
            setStatus('等待每日任务数据');
            return;
        }

        if (dailyQuestEnabled && !dailyQuestState.loadAttempted) {
            setStatus('正在读取每日任务数据');
            void refreshDailyQuests();
            return;
        }

        const api = window.ApiService;

        if (typeof api?.changeBiome !== 'function') {
            setStatus('等待游戏切图接口');
            return;
        }

        const player = getPlayer?.();

        if (!player) {
            setStatus('等待游戏角色数据');
            return;
        }

        if (currentEvaluationId !== evaluationId) {
            return;
        }

        if (!Object.hasOwn(player, 'boat')) {
            target = null;
            setStatus('等待游戏组队状态');
            return;
        }

        if (player?.boat) {
            target = null;
            setStatus('组队中暂不自动换图');
            await notifyBiomeReady(normalizeBiomeId(player.currentBiome));
            return;
        }

        target = selectBestBiome({
            biomeWeight: autoBiomeSettings.biomeWeight,
            competitionBiomes,
            dailyQuests: dailyQuestState.quests,
            player,
            priorityOrder: normalizedPriorityOrder,
            weatherByBiome,
        });

        const chasingGoldBreeze =
            goldBreezeEnabled && target?.weather === GOLD_BREEZE_WEATHER;

        if (chasingGoldBreeze) {
            target.baitId = getBaitIdForBiome(
                target.biomeId,
                autoBaitSettings?.goldBreezeBaitGrade ?? 'default',
            );
        }

        if (!target) {
            setStatus('没有可用的已解锁地图数据');
            await notifyBiomeReady(normalizeBiomeId(player.currentBiome));
            return;
        }

        const summary = formatTargetSummary(target);

        if (normalizeBiomeId(player.currentBiome) === target.biomeId) {
            if (chasingGoldBreeze && autoBaitSettings?.enabled !== true) {
                await autoEquipForBiome(player, target, { skipRod: true });
            }

            setStatus(`已在 ${summary}`);
            await notifyBiomeReady(target.biomeId);
            return;
        }

        switching = true;
        setStatus(`正在切换到 ${summary}`);

        try {
            const result = await api.changeBiome(target.biomeId);

            if (result?.success !== true) {
                throw new Error(result?.message ?? '游戏未确认切图成功');
            }

            await autoEquipForBiome(player, target, {
                skipBait: autoBaitSettings?.enabled === true,
            });
            setStatus(`已切换到 ${summary}，等待下一竿同步页面`);
            await notifyBiomeReady(target.biomeId);
        } catch (error) {
            console.error('[自动换图] 切换地图失败：', error);
            setStatus(`切图失败：${getErrorMessage(error)}`);
        } finally {
            switching = false;
        }
    }

    function handleStateChanged() {
        return evaluateBestBiome();
    }

    function handleCastResult(result) {
        const { autoBiomeSettings = {} } = getState?.() ?? {};

        if (
            Array.isArray(result?.completedQuests) &&
            result.completedQuests.length > 0 &&
            autoBiomeSettings.enabled === true &&
            isAutoBiomePriorityEnabled(
                autoBiomeSettings.priorityOrder,
                AUTO_BIOME_PRIORITY_IDS.dailyQuest,
            )
        ) {
            void refreshDailyQuests();
        }

        if (
            target &&
            normalizeBiomeId(result?.currentBiome) === target.biomeId
        ) {
            setStatus(`已在 ${formatTargetSummary(target)}`);
        }
    }

    function start() {
        scheduleHourlyFallback();
        void refreshWeather();
        void evaluateBestBiome();
    }

    function destroy() {
        window.clearTimeout(fallbackTimer);
        window.clearTimeout(competitionHookTimer);
    }

    return {
        destroy,
        getSnapshot,
        handleCastResult,
        handleCompetitionResponse,
        handleQuestResponse,
        handleStateChanged,
        handleWeatherResponse,
        isSwitching() {
            return switching;
        },
        refreshWeather,
        refreshDailyQuests,
        start,
    };
}
