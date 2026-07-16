const WEATHER_LABELS = {
    clear: '晴朗',
    rain: '雨天',
    windy: '大风',
    foggy: '大雾',
    heatwave: '热浪',
    storm: '暴风',
    blight: '枯萎',
    gold_breeze: '黄金微风',
    arcane_surge: '奥术涌动',
};
const COMPETITION_HOOK_DEBOUNCE = 1000;

function normalizeBiomeId(value) {
    const biomeId = Number(value);

    return Number.isInteger(biomeId) && biomeId > 0 ? biomeId : null;
}

function normalizeXpBonus(value) {
    const xpBonus = Number(value);

    return Number.isFinite(xpBonus) ? xpBonus : 0;
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

function getCompetitionType(biomeId, competitionBiomes) {
    if (
        biomeId === normalizeBiomeId(competitionBiomes?.guildTournamentBiomeId)
    ) {
        return 'guild';
    }

    if (biomeId === normalizeBiomeId(competitionBiomes?.personalDerbyBiomeId)) {
        return 'personal';
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
    player,
    preferCompetitionBiomes = false,
    weatherByBiome,
}) {
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

        const competitionType = preferCompetitionBiomes
            ? getCompetitionType(biomeId, competitionBiomes)
            : null;

        candidates.push({
            baitId: findAvailableBaitForBiome(player, biomeId),
            biomeId,
            competitionPriority:
                competitionType === 'guild'
                    ? 2
                    : competitionType === 'personal'
                      ? 1
                      : 0,
            ...(competitionType ? { competitionType } : {}),
            score: getBiomeScore(biomeId, weather.xpBonus, biomeWeight),
            weather: weather.weather,
            xpBonus: weather.xpBonus,
        });
    }

    candidates.sort(
        (left, right) =>
            right.competitionPriority - left.competitionPriority ||
            right.score - left.score ||
            right.biomeId - left.biomeId,
    );

    if (candidates.length === 0) {
        return null;
    }

    const { competitionPriority, ...bestBiome } = candidates[0];

    return bestBiome;
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

    const competitionLabel =
        target.competitionType === 'guild'
            ? '公会锦标赛优先 · '
            : target.competitionType === 'personal'
              ? '个人比赛优先 · '
              : '';

    return `${competitionLabel}${formatBiomeTarget(target)} · ${weatherLabel} ${signedXpBonus}% · 评分 ${target.score}`;
}

function getErrorMessage(error) {
    return String(error?.message ?? error ?? '未知错误');
}

async function autoEquipForBiome(player, target, { skipBait = false } = {}) {
    const api = window.ApiService;

    if (!skipBait && target.baitId && target.baitId !== player.equippedBait) {
        try {
            await api.equipBait(target.baitId);
        } catch (error) {
            console.warn('[自动换图] 无法自动装备目标地图鱼饵：', error);
        }
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
    getState,
    onBiomeReady,
    onStateChange,
}) {
    let evaluationId = 0;
    let eventSource = null;
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
            autoBiomeLastUpdatedAt: lastUpdatedAt,
            autoBiomeStatus: status,
            autoBiomeTarget: target,
            autoBiomeWeatherByBiome: weatherByBiome,
        };
    }

    function formatCompetitionStatus(biomes) {
        const labels = [];

        if (biomes.guildTournamentBiomeId) {
            labels.push(`公会 B${biomes.guildTournamentBiomeId}`);
        }

        if (biomes.personalDerbyBiomeId) {
            labels.push(`个人 B${biomes.personalDerbyBiomeId}`);
        }

        return labels.length > 0 ? labels.join(' · ') : '暂无已参与的比赛';
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
        competitionStatus = formatCompetitionStatus(competitionBiomes);
        competitionUpdatedAt = Date.now();
        notifyStateChanged();
    }

    function hasCompetitionSnapshot() {
        if (derbyResponse === undefined || tournamentResponse === undefined) {
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

    function applyWeather(payload, source) {
        const nextWeather = normalizeWeatherByBiome(payload);

        if (Object.keys(nextWeather).length === 0) {
            return false;
        }

        weatherByBiome = nextWeather;
        lastUpdatedAt = Date.now();

        if (source === 'stream') {
            weatherRevision += 1;
        }

        notifyStateChanged();
        void evaluateBestBiome();
        return true;
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

    function scheduleHourlyFallback() {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = window.setTimeout(async () => {
            await refreshWeather();
            scheduleHourlyFallback();
        }, getNextHourlyRefreshDelay());
    }

    function connectWeatherStream() {
        if (typeof window.EventSource !== 'function') {
            console.warn(
                '[自动换图] 当前浏览器不支持天气推送，改为整点刷新天气。',
            );
            scheduleHourlyFallback();
            return;
        }

        const baseUrl = String(
            window.ApiService?.baseURL ?? `${window.location.origin}/api`,
        ).replace(/\/$/, '');

        eventSource = new window.EventSource(`${baseUrl}/game/weather/stream`);
        eventSource.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);

                if (payload?.type === 'weather_update') {
                    applyWeather(payload, 'stream');
                }
            } catch (error) {
                console.warn('[自动换图] 无法解析天气推送：', error);
            }
        };
        eventSource.onerror = () => {
            console.warn('[自动换图] 天气推送暂时断开，等待自动重连。');
        };
    }

    async function evaluateBestBiome() {
        const currentEvaluationId = ++evaluationId;
        const { autoBaitSettings, autoBiomeSettings, enabled } = getState();

        if (!autoBiomeSettings.enabled) {
            target = null;
            competitionStatus =
                autoBiomeSettings.preferCompetitionBiomes !== false
                    ? '自动换图开启后检测'
                    : '已关闭';
            setStatus('未启用');
            return;
        }

        if (!enabled) {
            target = null;
            competitionStatus =
                autoBiomeSettings.preferCompetitionBiomes !== false
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
            autoBiomeSettings.preferCompetitionBiomes !== false &&
            (!hasCompetitionSnapshot() || competitionHookPending)
        ) {
            competitionStatus = '等待游戏比赛轮询';
            setStatus('等待游戏比赛数据');
            return;
        }

        const api = window.ApiService;

        if (
            typeof api?.getPlayerData !== 'function' ||
            typeof api?.changeBiome !== 'function'
        ) {
            setStatus('等待游戏角色数据');
            return;
        }

        let player;

        try {
            player = await api.getPlayerData();
        } catch (error) {
            console.warn('[自动换图] 无法读取角色数据：', error);
            setStatus('角色数据读取失败');
            return;
        }

        if (currentEvaluationId !== evaluationId) {
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
            player,
            preferCompetitionBiomes:
                autoBiomeSettings.preferCompetitionBiomes !== false,
            weatherByBiome,
        });

        if (!target) {
            setStatus('没有可用的已解锁地图数据');
            await notifyBiomeReady(normalizeBiomeId(player.currentBiome));
            return;
        }

        const summary = formatTargetSummary(target);

        if (normalizeBiomeId(player.currentBiome) === target.biomeId) {
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
        if (
            target &&
            normalizeBiomeId(result?.currentBiome) === target.biomeId
        ) {
            setStatus(`已在 ${formatTargetSummary(target)}`);
        }
    }

    function start() {
        connectWeatherStream();
        void refreshWeather();
        void evaluateBestBiome();
    }

    function destroy() {
        eventSource?.close();
        window.clearTimeout(fallbackTimer);
        window.clearTimeout(competitionHookTimer);
    }

    return {
        destroy,
        getSnapshot,
        handleCastResult,
        handleCompetitionResponse,
        handleStateChanged,
        isSwitching() {
            return switching;
        },
        refreshWeather,
        start,
    };
}
