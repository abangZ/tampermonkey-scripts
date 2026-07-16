import { EARNINGS_CATEGORY_DISPLAY, PANEL_ID } from '../config.js';
import { filterEarningsStats, listEarningsBreakdowns } from '../earnings.js';
import { loadPanelCollapsed, savePanelCollapsed } from '../storage.js';
import panelStyles from './panel.css?raw';

export function createPanelController({
    actions,
    formatScheduleDuration,
    getState,
}) {
    let panelCollapsed = loadPanelCollapsed();
    let panelView = 'control';
    let earningsBiomeFilter = 'current';
    let earningsBaitFilter = 'current';
    let ui = null;

    const {
        requestBrowserNotificationPermission,
        resetEarningsStats,
        setAutoBaitEnabled,
        setAutoBaitGrade,
        setAutoBaitMinimumQuantity,
        setAutoBaitPurchaseQuantity,
        setAutoBiomeEnabled,
        setAutoBiomeChaseGoldBreeze,
        setAutoBiomePreferCompetition,
        setAutoBiomeWeight,
        setCaptchaBypassEnabled,
        setEnabled,
        setIdleReloadMinutes,
        setNotificationMode,
        setPushKey,
        setScheduleEnabled,
        setScheduleMinutes,
    } = actions;

    function normalizeText(text) {
        return String(text ?? '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function toFiniteNumber(value) {
        const number = Number(value);

        return Number.isFinite(number) ? number : 0;
    }

    /**
     * 创建右下角控制面板。
     */
    function createPanel() {
        if (document.getElementById(PANEL_ID)) {
            return;
        }

        const host = document.createElement('div');

        host.id = PANEL_ID;
        host.style.cssText = [
            'position: fixed',
            'right: 16px',
            'bottom: 16px',
            'z-index: 2147483647',
            'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        ].join(';');

        const shadowRoot = host.attachShadow({
            mode: 'open',
        });
        const baitGradeOptions = `
              <option value="default">默认饵（无限，不购买）</option>
              <option value="low">低级饵</option>
              <option value="medium">中级饵（+250 幸运）</option>
              <option value="high">高级饵（+500 幸运）</option>
              <option value="super">超级饵（+1000 幸运）</option>
        `;

        shadowRoot.innerHTML = `
  <style>${panelStyles}</style>

  <div class="panel">
    <div class="header">
      <div class="title">
        <span aria-hidden="true">🎣</span>
        <span class="title-text">自动抛竿</span>
      </div>

      <button
        id="collapse-toggle"
        class="collapse-toggle"
        type="button"
        aria-controls="panel-content"
      >−</button>
    </div>

    <div id="panel-content" class="panel-content">
      <div class="tabs" role="tablist" aria-label="面板内容">
        <button
          id="control-tab"
          class="panel-tab"
          type="button"
          role="tab"
          aria-controls="control-view"
          aria-selected="true"
          data-active="true"
        >控制</button>
        <button
          id="earnings-tab"
          class="panel-tab"
          type="button"
          role="tab"
          aria-controls="earnings-view"
          aria-selected="false"
          data-active="false"
        >收益</button>
        <button
          id="settings-tab"
          class="panel-tab"
          type="button"
          role="tab"
          aria-controls="settings-view"
          aria-selected="false"
          data-active="false"
        >设置</button>
      </div>

      <div
        id="control-view"
        class="panel-view"
        role="tabpanel"
        aria-labelledby="control-tab"
      >

        <div class="row">
          <span class="label">状态</span>
          <span id="status" class="value">初始化中</span>
        </div>

        <div class="row">
          <span class="label">下一操作</span>
          <span id="next-delay" class="value">—</span>
        </div>

        <div class="row">
          <span class="label">点击次数</span>
          <span id="click-count" class="value">0</span>
        </div>

        <div class="row">
          <span class="label">选图状态</span>
          <span id="auto-biome-status" class="value">等待天气数据</span>
        </div>

        <div class="row">
          <span class="label">鱼饵状态</span>
          <span id="auto-bait-status" class="value">未启用</span>
        </div>

        <label class="option-row">
          <span>自动换地图</span>
          <span class="switch">
            <input
              id="auto-biome-toggle"
              type="checkbox"
              role="switch"
              aria-label="自动换地图"
            />
            <span class="switch-track" aria-hidden="true"></span>
          </span>
        </label>

        <label class="option-row">
          <span>自动买鱼饵</span>
          <span class="switch">
            <input
              id="auto-bait-toggle"
              type="checkbox"
              role="switch"
              aria-label="自动买鱼饵"
            />
            <span class="switch-track" aria-hidden="true"></span>
          </span>
        </label>

        <label class="option-row">
          <span>自动过验证</span>
          <span class="switch">
            <input
              id="captcha-bypass-toggle"
              type="checkbox"
              role="switch"
              aria-label="自动过验证"
            />
            <span class="switch-track" aria-hidden="true"></span>
          </span>
        </label>

        <button id="toggle" class="toggle" type="button">
          启动
        </button>

        <div class="hint">快捷键：Alt + A</div>
      </div>

      <div
        id="earnings-view"
        class="panel-view"
        role="tabpanel"
        aria-labelledby="earnings-tab"
        hidden
      >
        <div class="stats-filters">
          <label class="stats-filter">
            <span>地图范围</span>
            <select id="stats-biome-filter" class="stats-select"></select>
          </label>
          <label class="stats-filter">
            <span>鱼饵范围</span>
            <select id="stats-bait-filter" class="stats-select"></select>
          </label>
        </div>

        <div id="stats-scope" class="stats-scope">—</div>
        <div id="stats-start" class="stats-start">—</div>

        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-card-label">成功抛竿</span>
            <strong id="stats-casts" class="stat-card-value">0</strong>
          </div>
          <div class="stat-card">
            <span class="stat-card-label">鱼获</span>
            <strong id="stats-fish" class="stat-card-value">0</strong>
          </div>
          <div class="stat-card">
            <span class="stat-card-label">直接金币</span>
            <strong
              id="stats-gold"
              class="stat-card-value"
              data-tone="income"
            >0</strong>
          </div>
          <div class="stat-card">
            <span class="stat-card-label">鱼获价值</span>
            <strong
              id="stats-fish-gold"
              class="stat-card-value"
              data-tone="gold"
            >0</strong>
          </div>
          <div class="stat-card">
            <span class="stat-card-label">鱼饵成本</span>
            <strong
              id="stats-bait-cost"
              class="stat-card-value"
              data-tone="cost"
            >0</strong>
          </div>
          <div class="stat-card">
            <span class="stat-card-label">净收益</span>
            <strong
              id="stats-net-gold"
              class="stat-card-value"
              data-tone="neutral"
            >0</strong>
          </div>
          <div class="stat-card">
            <span class="stat-card-label">经验</span>
            <strong id="stats-xp" class="stat-card-value">0</strong>
          </div>
          <div class="stat-card">
            <span class="stat-card-label">遗物</span>
            <strong id="stats-relics" class="stat-card-value">0</strong>
          </div>
          <div class="stat-card">
            <span class="stat-card-label">宝箱</span>
            <strong id="stats-treasures" class="stat-card-value">0</strong>
          </div>
          <div class="stat-card">
            <span class="stat-card-label">装备</span>
            <strong id="stats-gears" class="stat-card-value">0</strong>
          </div>
          <div class="stat-card">
            <span class="stat-card-label">每竿净收益</span>
            <strong
              id="stats-net-average"
              class="stat-card-value"
              data-tone="neutral"
            >0</strong>
          </div>
        </div>

        <div id="stats-cost-note" class="stats-cost-note" hidden></div>

        <div class="stats-section-title">收获分类</div>
        <div id="rarity-stats" class="stats-list"></div>

        <button id="reset-stats" class="reset-stats" type="button">
          重置收益统计
        </button>
      </div>

      <div
        id="settings-view"
        class="panel-view"
        role="tabpanel"
        aria-labelledby="settings-tab"
        hidden
      >
        <details class="settings-section">
          <summary class="settings-title">自动换地图</summary>

          <label class="option-row">
            <span>优先比赛地图</span>
            <span class="switch">
              <input
                id="auto-biome-competition-toggle"
                type="checkbox"
                role="switch"
                aria-label="自动换图时优先比赛地图"
              />
              <span class="switch-track" aria-hidden="true"></span>
            </span>
          </label>

          <div class="field-help">
            仅优先已参与且已解锁的比赛地图；公会锦标赛优先于个人比赛。
          </div>

          <label class="option-row">
            <span>追逐金风</span>
            <span class="switch">
              <input
                id="auto-biome-gold-breeze-toggle"
                type="checkbox"
                role="switch"
                aria-label="无比赛时优先选择金风地图"
              />
              <span class="switch-track" aria-hidden="true"></span>
            </span>
          </label>

          <div class="field-help">
            无可用比赛地图时优先选择金风天气；没有金风时再按经验评分选择。
          </div>

          <div
            class="choice-list choice-list-three"
            role="radiogroup"
            aria-label="地图等级加权量"
          >
            <label class="choice-option">
              <input
                type="radio"
                name="auto-biome-weight"
                value="0"
              />
              <span>0%</span>
            </label>
            <label class="choice-option">
              <input
                type="radio"
                name="auto-biome-weight"
                value="5"
              />
              <span>5%</span>
            </label>
            <label class="choice-option">
              <input
                type="radio"
                name="auto-biome-weight"
                value="10"
              />
              <span>10%</span>
            </label>
          </div>

          <div class="field-help">
            无可用比赛地图和需追逐的金风地图时，评分 = 天气经验加成 +（地图编号 - 1）× 加权量；同分时选择编号最高的已解锁地图。
          </div>

          <div class="row">
            <span class="label">比赛地图</span>
            <span id="auto-biome-competition-status" class="value">自动换图开启后检测</span>
          </div>

          <div class="row">
            <span class="label">天气更新</span>
            <span id="auto-biome-updated-at" class="value">等待接口数据</span>
          </div>
        </details>

        <details class="settings-section">
          <summary class="settings-title">自动买鱼饵</summary>

          <label class="field">
            <span class="field-label">常规鱼饵</span>
            <select id="auto-bait-regular-grade" class="input">
              ${baitGradeOptions}
            </select>
          </label>

          <label class="field">
            <span class="field-label">个人赛鱼饵</span>
            <select id="auto-bait-personal-grade" class="input">
              ${baitGradeOptions}
            </select>
          </label>

          <label class="field">
            <span class="field-label">公会赛鱼饵</span>
            <select id="auto-bait-guild-grade" class="input">
              ${baitGradeOptions}
            </select>
          </label>

          <label class="field">
            <span class="field-label">金风鱼饵</span>
            <select id="auto-bait-gold-breeze-grade" class="input">
              ${baitGradeOptions}
            </select>
          </label>

          <div id="auto-bait-purchase-settings" class="settings-group">
            <div class="number-grid">
              <label class="field">
                <span class="field-label">库存低于</span>
                <input
                  id="auto-bait-minimum-quantity"
                  class="input"
                  type="number"
                  min="100"
                  max="100000"
                  step="100"
                  inputmode="numeric"
                />
              </label>

              <label class="field">
                <span class="field-label">每次购买</span>
                <select id="auto-bait-purchase-quantity" class="input">
                  <option value="100">100 个</option>
                  <option value="1000">1000 个</option>
                </select>
              </label>
            </div>

            <div class="field-help">
              金风天气优先使用独立鱼饵设置，默认为免费默认饵；其他天气根据当前地图是否为个人赛或公会赛地图选择鱼饵。库存低于设置值时购买，阈值按 100 的倍数保存。
            </div>
          </div>

          <div class="row">
            <span class="label">上次购买</span>
            <span id="auto-bait-last-purchased-at" class="value">暂无</span>
          </div>
        </details>

        <details class="settings-section">
          <summary class="settings-title">卡住自动恢复</summary>

          <label class="field">
            <span class="field-label">连续未钓鱼（分钟）</span>
            <input
              id="idle-reload-minutes"
              class="input"
              type="number"
              min="1"
              max="1440"
              step="1"
              inputmode="numeric"
            />
          </label>

          <div class="field-help">
            自动抛竿运行期间，连续超过该时间未收到钓鱼结果时刷新一次页面；定时休息期间不计时。
          </div>
        </details>

        <details class="settings-section">
          <summary class="settings-title">消息通知</summary>

          <div
            class="choice-list"
            role="radiogroup"
            aria-label="消息通知方式"
          >
            <label class="choice-option">
              <input
                type="radio"
                name="notification-mode"
                value="server"
              />
              <span>Server酱</span>
            </label>
            <label class="choice-option">
              <input
                type="radio"
                name="notification-mode"
                value="browser"
              />
              <span>浏览器通知</span>
            </label>
          </div>

          <div id="server-notification-settings" class="settings-group">
            <label class="field">
              <span class="field-label">消息推送 Key</span>
              <input
                id="push-key"
                class="input"
                type="password"
                autocomplete="off"
                spellcheck="false"
                placeholder="Server酱 SendKey"
              />
            </label>

            <div id="push-key-help" class="field-help">
              未填写 Key。请前往
              <a
                href="https://sct.ftqq.com/"
                target="_blank"
                rel="noopener noreferrer"
              >Server酱官网</a>，登录后按页面提示获取 SendKey。
            </div>
            <div class="field-help">
              Server酱每日免费额度仅 5 条，推荐优先使用浏览器通知。
            </div>
          </div>

          <div
            id="browser-notification-settings"
            class="settings-group"
            hidden
          >
            <div class="row">
              <span class="label">通知权限</span>
              <span
                id="browser-notification-permission"
                class="value"
              >检查中</span>
            </div>
            <button
              id="browser-notification-permission-button"
              class="secondary-button"
              type="button"
            >授权浏览器通知</button>
            <div class="field-help">
              浏览器通知仅在当前浏览器和站点授权后可用。
            </div>
          </div>
        </details>

        <details class="settings-section">
          <summary class="settings-title">定时休息</summary>

          <label class="option-row">
            <span>启用运行/休息周期</span>
            <span class="switch">
              <input
                id="schedule-enabled-toggle"
                type="checkbox"
                role="switch"
                aria-label="启用运行和休息周期"
              />
              <span class="switch-track" aria-hidden="true"></span>
            </span>
          </label>

          <div id="schedule-settings" class="settings-group" hidden>
            <div class="number-grid">
              <label class="field">
                <span class="field-label">运行分钟</span>
                <input
                  id="schedule-work-minutes"
                  class="input"
                  type="number"
                  min="1"
                  max="1440"
                  step="1"
                  inputmode="numeric"
                />
              </label>
              <label class="field">
                <span class="field-label">休息分钟</span>
                <input
                  id="schedule-rest-minutes"
                  class="input"
                  type="number"
                  min="1"
                  max="1440"
                  step="1"
                  inputmode="numeric"
                />
              </label>
            </div>

            <div class="row">
              <span class="label">当前周期</span>
              <span id="schedule-status" class="value">等待启动</span>
            </div>

            <div class="field-help">
              每轮实际运行和休息时长，都会在设置值上加入 -5%～+10% 的随机时间。
            </div>
          </div>
        </details>
      </div>
    </div>
  </div>
`;

        document.body.appendChild(host);

        ui = {
            panel: shadowRoot.querySelector('.panel'),
            status: shadowRoot.querySelector('#status'),
            nextDelay: shadowRoot.querySelector('#next-delay'),
            clickCount: shadowRoot.querySelector('#click-count'),
            autoBiomeStatus: shadowRoot.querySelector('#auto-biome-status'),
            autoBiomeToggle: shadowRoot.querySelector('#auto-biome-toggle'),
            autoBiomeCompetitionToggle: shadowRoot.querySelector(
                '#auto-biome-competition-toggle',
            ),
            autoBiomeGoldBreezeToggle: shadowRoot.querySelector(
                '#auto-biome-gold-breeze-toggle',
            ),
            autoBiomeCompetitionStatus: shadowRoot.querySelector(
                '#auto-biome-competition-status',
            ),
            autoBiomeWeightInputs: shadowRoot.querySelectorAll(
                'input[name="auto-biome-weight"]',
            ),
            autoBiomeUpdatedAt: shadowRoot.querySelector(
                '#auto-biome-updated-at',
            ),
            autoBaitStatus: shadowRoot.querySelector('#auto-bait-status'),
            autoBaitToggle: shadowRoot.querySelector('#auto-bait-toggle'),
            autoBaitRegularGrade: shadowRoot.querySelector(
                '#auto-bait-regular-grade',
            ),
            autoBaitPersonalGrade: shadowRoot.querySelector(
                '#auto-bait-personal-grade',
            ),
            autoBaitGuildGrade: shadowRoot.querySelector(
                '#auto-bait-guild-grade',
            ),
            autoBaitGoldBreezeGrade: shadowRoot.querySelector(
                '#auto-bait-gold-breeze-grade',
            ),
            autoBaitPurchaseSettings: shadowRoot.querySelector(
                '#auto-bait-purchase-settings',
            ),
            autoBaitMinimumQuantity: shadowRoot.querySelector(
                '#auto-bait-minimum-quantity',
            ),
            autoBaitPurchaseQuantity: shadowRoot.querySelector(
                '#auto-bait-purchase-quantity',
            ),
            autoBaitLastPurchasedAt: shadowRoot.querySelector(
                '#auto-bait-last-purchased-at',
            ),
            idleReloadMinutes: shadowRoot.querySelector('#idle-reload-minutes'),
            pushKeyInput: shadowRoot.querySelector('#push-key'),
            pushKeyHelp: shadowRoot.querySelector('#push-key-help'),
            captchaBypassToggle: shadowRoot.querySelector(
                '#captcha-bypass-toggle',
            ),
            controlTab: shadowRoot.querySelector('#control-tab'),
            earningsTab: shadowRoot.querySelector('#earnings-tab'),
            settingsTab: shadowRoot.querySelector('#settings-tab'),
            controlView: shadowRoot.querySelector('#control-view'),
            earningsView: shadowRoot.querySelector('#earnings-view'),
            settingsView: shadowRoot.querySelector('#settings-view'),
            notificationModeInputs: shadowRoot.querySelectorAll(
                'input[name="notification-mode"]',
            ),
            serverNotificationSettings: shadowRoot.querySelector(
                '#server-notification-settings',
            ),
            browserNotificationSettings: shadowRoot.querySelector(
                '#browser-notification-settings',
            ),
            browserNotificationPermission: shadowRoot.querySelector(
                '#browser-notification-permission',
            ),
            browserNotificationPermissionButton: shadowRoot.querySelector(
                '#browser-notification-permission-button',
            ),
            scheduleEnabledToggle: shadowRoot.querySelector(
                '#schedule-enabled-toggle',
            ),
            scheduleSettings: shadowRoot.querySelector('#schedule-settings'),
            scheduleWorkMinutes: shadowRoot.querySelector(
                '#schedule-work-minutes',
            ),
            scheduleRestMinutes: shadowRoot.querySelector(
                '#schedule-rest-minutes',
            ),
            scheduleStatus: shadowRoot.querySelector('#schedule-status'),
            statsBiomeFilter: shadowRoot.querySelector('#stats-biome-filter'),
            statsBaitFilter: shadowRoot.querySelector('#stats-bait-filter'),
            statsScope: shadowRoot.querySelector('#stats-scope'),
            statsStart: shadowRoot.querySelector('#stats-start'),
            statsCasts: shadowRoot.querySelector('#stats-casts'),
            statsFish: shadowRoot.querySelector('#stats-fish'),
            statsGold: shadowRoot.querySelector('#stats-gold'),
            statsFishGold: shadowRoot.querySelector('#stats-fish-gold'),
            statsBaitCost: shadowRoot.querySelector('#stats-bait-cost'),
            statsNetGold: shadowRoot.querySelector('#stats-net-gold'),
            statsXp: shadowRoot.querySelector('#stats-xp'),
            statsRelics: shadowRoot.querySelector('#stats-relics'),
            statsTreasures: shadowRoot.querySelector('#stats-treasures'),
            statsGears: shadowRoot.querySelector('#stats-gears'),
            statsNetAverage: shadowRoot.querySelector('#stats-net-average'),
            statsCostNote: shadowRoot.querySelector('#stats-cost-note'),
            rarityStats: shadowRoot.querySelector('#rarity-stats'),
            resetStats: shadowRoot.querySelector('#reset-stats'),
            collapseToggle: shadowRoot.querySelector('#collapse-toggle'),
            toggle: shadowRoot.querySelector('#toggle'),
        };

        ui.pushKeyInput.value = getState().pushKey;

        ui.pushKeyInput.addEventListener('input', (event) => {
            setPushKey(event.currentTarget.value);
            renderPushKeyHelp();
        });

        ui.collapseToggle.addEventListener('click', () => {
            setPanelCollapsed(!panelCollapsed);
        });

        ui.toggle.addEventListener('click', () => {
            setEnabled(!getState().enabled);
        });

        ui.captchaBypassToggle.addEventListener('change', (event) => {
            setCaptchaBypassEnabled(event.currentTarget.checked);
        });

        ui.autoBiomeToggle.addEventListener('change', (event) => {
            setAutoBiomeEnabled(event.currentTarget.checked);
        });

        ui.autoBiomeCompetitionToggle.addEventListener('change', (event) => {
            setAutoBiomePreferCompetition(event.currentTarget.checked);
        });

        ui.autoBiomeGoldBreezeToggle.addEventListener('change', (event) => {
            setAutoBiomeChaseGoldBreeze(event.currentTarget.checked);
        });

        ui.autoBaitToggle.addEventListener('change', (event) => {
            setAutoBaitEnabled(event.currentTarget.checked);
        });

        ui.autoBaitRegularGrade.addEventListener('change', (event) => {
            setAutoBaitGrade('regularBaitGrade', event.currentTarget.value);
        });

        ui.autoBaitPersonalGrade.addEventListener('change', (event) => {
            setAutoBaitGrade(
                'personalCompetitionBaitGrade',
                event.currentTarget.value,
            );
        });

        ui.autoBaitGuildGrade.addEventListener('change', (event) => {
            setAutoBaitGrade(
                'guildCompetitionBaitGrade',
                event.currentTarget.value,
            );
        });

        ui.autoBaitGoldBreezeGrade.addEventListener('change', (event) => {
            setAutoBaitGrade('goldBreezeBaitGrade', event.currentTarget.value);
        });

        ui.autoBaitMinimumQuantity.addEventListener('change', (event) => {
            setAutoBaitMinimumQuantity(event.currentTarget.value);
        });

        ui.autoBaitPurchaseQuantity.addEventListener('change', (event) => {
            setAutoBaitPurchaseQuantity(event.currentTarget.value);
        });

        ui.idleReloadMinutes.addEventListener('change', (event) => {
            setIdleReloadMinutes(event.currentTarget.value);
        });

        for (const input of ui.autoBiomeWeightInputs) {
            input.addEventListener('change', (event) => {
                if (event.currentTarget.checked) {
                    setAutoBiomeWeight(event.currentTarget.value);
                }
            });
        }

        ui.controlTab.addEventListener('click', () => {
            setPanelView('control');
        });

        ui.earningsTab.addEventListener('click', () => {
            setPanelView('earnings');
        });

        ui.settingsTab.addEventListener('click', () => {
            setPanelView('settings');
        });

        for (const input of ui.notificationModeInputs) {
            input.addEventListener('change', (event) => {
                if (event.currentTarget.checked) {
                    setNotificationMode(event.currentTarget.value);
                }
            });
        }

        ui.browserNotificationPermissionButton.addEventListener('click', () => {
            void requestBrowserNotificationPermission();
        });

        ui.scheduleEnabledToggle.addEventListener('change', (event) => {
            setScheduleEnabled(event.currentTarget.checked);
        });

        ui.scheduleWorkMinutes.addEventListener('change', (event) => {
            setScheduleMinutes('workMinutes', event.currentTarget.value);
        });

        ui.scheduleRestMinutes.addEventListener('change', (event) => {
            setScheduleMinutes('restMinutes', event.currentTarget.value);
        });

        ui.resetStats.addEventListener('click', () => {
            resetEarningsStats();
        });

        ui.statsBiomeFilter.addEventListener('change', (event) => {
            earningsBiomeFilter = event.currentTarget.value;
            earningsBaitFilter =
                earningsBiomeFilter === 'current' ? 'current' : 'all';
            renderEarningsStats();
        });

        ui.statsBaitFilter.addEventListener('change', (event) => {
            earningsBaitFilter = event.currentTarget.value;
            renderEarningsStats();
        });

        renderToggle();
        renderAutoBaitSettings();
        renderAutoBiomeSettings();
        renderCaptchaBypassToggle();
        renderIdleReloadSettings();
        renderPanelCollapsed();
        renderNotificationSettings();
        renderScheduleSettings();
        updateClickCount();
        setPanelView(panelView);
        renderEarningsStats();
    }

    function setStatus(text) {
        if (ui?.status) {
            ui.status.textContent = text;
        }
    }

    function setNextDelay(text) {
        if (ui?.nextDelay) {
            ui.nextDelay.textContent = text;
        }
    }

    function updateClickCount() {
        if (ui?.clickCount) {
            ui.clickCount.textContent = String(getState().clickCount);
        }
    }

    function setPanelView(nextView) {
        panelView =
            nextView === 'earnings' || nextView === 'settings'
                ? nextView
                : 'control';

        if (
            !ui?.controlTab ||
            !ui?.earningsTab ||
            !ui?.settingsTab ||
            !ui?.controlView ||
            !ui?.earningsView ||
            !ui?.settingsView
        ) {
            return;
        }

        const panelItems = [
            ['control', ui.controlTab, ui.controlView],
            ['earnings', ui.earningsTab, ui.earningsView],
            ['settings', ui.settingsTab, ui.settingsView],
        ];

        for (const [view, tab, panel] of panelItems) {
            const active = panelView === view;

            tab.dataset.active = active ? 'true' : 'false';
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
            panel.hidden = !active;
        }

        if (panelView === 'earnings') {
            renderEarningsStats();
        } else if (panelView === 'settings') {
            renderAutoBaitSettings();
            renderAutoBiomeSettings();
            renderIdleReloadSettings();
            renderNotificationSettings();
            renderScheduleSettings();
        }
    }

    function formatStatNumber(value, maximumFractionDigits = 0) {
        return new Intl.NumberFormat('zh-CN', {
            maximumFractionDigits,
        }).format(toFiniteNumber(value));
    }

    function renderSignedStatTone(element, value) {
        const number = toFiniteNumber(value);

        element.dataset.tone =
            number > 0 ? 'positive' : number < 0 ? 'negative' : 'neutral';
    }

    function compareDimensionIds(left, right) {
        const leftNumber = Number(left);
        const rightNumber = Number(right);

        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
            return leftNumber - rightNumber;
        }

        return String(left).localeCompare(String(right));
    }

    function formatBiomeLabel(context) {
        return context.biomeId === 'unknown'
            ? context.biomeName
            : `[B${context.biomeId}] ${context.biomeName}`;
    }

    function formatBaitLabel(context) {
        const cost =
            context.baitPrice === null
                ? '成本未知'
                : `${formatStatNumber(context.baitPrice, 2)} 金币/竿`;

        return `${context.baitName} · ${cost}`;
    }

    function replaceSelectOptions(select, options, selectedValue) {
        select.replaceChildren();

        for (const optionData of options) {
            const option = document.createElement('option');

            option.value = optionData.value;
            option.textContent = optionData.label;
            option.disabled = Boolean(optionData.disabled);
            select.appendChild(option);
        }

        const selectedOption = options.find(
            (option) => option.value === selectedValue,
        );

        select.value = selectedOption ? selectedValue : 'all';
        return select.value;
    }

    function getResolvedBiomeId(earningsStats) {
        if (earningsBiomeFilter === 'current') {
            return earningsStats.lastContext?.biomeId ?? null;
        }

        return earningsBiomeFilter === 'all'
            ? null
            : earningsBiomeFilter.slice('biome:'.length);
    }

    function renderEarningsFilters(earningsStats) {
        const breakdowns = listEarningsBreakdowns(earningsStats);
        const currentContext = earningsStats.lastContext;
        const biomeContexts = new Map();

        for (const breakdown of breakdowns) {
            biomeContexts.set(breakdown.biomeId, breakdown);
        }

        if (currentContext) {
            biomeContexts.set(currentContext.biomeId, currentContext);
        }

        const sortedBiomeContexts = [...biomeContexts.values()].sort(
            (left, right) => compareDimensionIds(left.biomeId, right.biomeId),
        );
        const biomeOptions = [
            {
                value: 'current',
                label: currentContext
                    ? `当前 · ${formatBiomeLabel(currentContext)}`
                    : '当前地图（等待首次抛竿）',
                disabled: !currentContext,
            },
            {
                value: 'all',
                label: '全部地图',
            },
            ...sortedBiomeContexts.map((context) => ({
                value: `biome:${context.biomeId}`,
                label: formatBiomeLabel(context),
            })),
        ];

        earningsBiomeFilter = replaceSelectOptions(
            ui.statsBiomeFilter,
            biomeOptions,
            earningsBiomeFilter,
        );

        const resolvedBiomeId = getResolvedBiomeId(earningsStats);
        const baitContexts = new Map();

        for (const breakdown of breakdowns) {
            if (
                resolvedBiomeId !== null &&
                breakdown.biomeId !== resolvedBiomeId
            ) {
                continue;
            }

            baitContexts.set(breakdown.baitId, breakdown);
        }

        const currentBaitAvailable =
            currentContext &&
            (resolvedBiomeId === null ||
                resolvedBiomeId === currentContext.biomeId);

        if (currentBaitAvailable) {
            baitContexts.set(currentContext.baitId, currentContext);
        }

        const sortedBaitContexts = [...baitContexts.values()].sort(
            (left, right) => left.baitName.localeCompare(right.baitName),
        );
        const baitOptions = [
            {
                value: 'current',
                label: currentBaitAvailable
                    ? `当前 · ${formatBaitLabel(currentContext)}`
                    : '当前鱼饵（不在所选地图）',
                disabled: !currentBaitAvailable,
            },
            {
                value: 'all',
                label: '全部鱼饵',
            },
            ...sortedBaitContexts.map((context) => ({
                value: `bait:${context.baitId}`,
                label: formatBaitLabel(context),
            })),
        ];

        earningsBaitFilter = replaceSelectOptions(
            ui.statsBaitFilter,
            baitOptions,
            earningsBaitFilter,
        );
    }

    function resolveEarningsFilter(earningsStats) {
        const currentContext = earningsStats.lastContext;
        const currentBiomeMissing =
            earningsBiomeFilter === 'current' && !currentContext;
        const currentBaitMissing =
            earningsBaitFilter === 'current' && !currentContext;

        return {
            ready: !currentBiomeMissing && !currentBaitMissing,
            biomeId:
                earningsBiomeFilter === 'current'
                    ? currentContext?.biomeId
                    : earningsBiomeFilter === 'all'
                      ? null
                      : earningsBiomeFilter.slice('biome:'.length),
            baitId:
                earningsBaitFilter === 'current'
                    ? currentContext?.baitId
                    : earningsBaitFilter === 'all'
                      ? null
                      : earningsBaitFilter.slice('bait:'.length),
        };
    }

    function getEarningsScopeLabel(earningsStats, filter) {
        if (!filter.ready) {
            return '等待首次抛竿确认当前地图和鱼饵';
        }

        const breakdowns = listEarningsBreakdowns(earningsStats);
        const biomeContext =
            earningsStats.lastContext?.biomeId === filter.biomeId
                ? earningsStats.lastContext
                : breakdowns.find(
                      (breakdown) => breakdown.biomeId === filter.biomeId,
                  );
        const baitContext =
            earningsStats.lastContext?.baitId === filter.baitId
                ? earningsStats.lastContext
                : breakdowns.find(
                      (breakdown) => breakdown.baitId === filter.baitId,
                  );
        const biomeLabel =
            filter.biomeId === null
                ? '全部地图'
                : formatBiomeLabel(
                      biomeContext ?? {
                          biomeId: filter.biomeId,
                          biomeName: `地图 ${filter.biomeId}`,
                      },
                  );
        const baitLabel =
            filter.baitId === null
                ? '全部鱼饵'
                : (baitContext?.baitName ?? filter.baitId);

        return `${biomeLabel} · ${baitLabel}`;
    }

    function getEarningsCategoryDisplay(category) {
        const originalLabel = normalizeText(category) || 'Unknown';
        const display = EARNINGS_CATEGORY_DISPLAY[originalLabel.toLowerCase()];

        return (
            display ?? {
                label: originalLabel,
                tone: 'unknown',
            }
        );
    }

    function renderStatsList(container, entries, emptyText) {
        if (!container) {
            return;
        }

        container.replaceChildren();

        if (entries.length === 0) {
            const empty = document.createElement('span');

            empty.className = 'empty-stat';
            empty.textContent = emptyText;
            container.appendChild(empty);
            return;
        }

        for (const [category, count] of entries) {
            const chip = document.createElement('span');
            const display = getEarningsCategoryDisplay(category);

            chip.className = 'stat-chip';
            chip.dataset.tone = display.tone;
            chip.textContent = `${display.label} ×${formatStatNumber(count)}`;
            chip.title = chip.textContent;
            container.appendChild(chip);
        }
    }

    function renderEarningsStats() {
        if (!ui?.statsCasts) {
            return;
        }

        const { earningsStats } = getState();
        renderEarningsFilters(earningsStats);

        const filter = resolveEarningsFilter(earningsStats);
        const filteredStats = filter.ready
            ? filterEarningsStats(earningsStats, filter)
            : filterEarningsStats(earningsStats, {
                  biomeId: '__missing__',
                  baitId: '__missing__',
              });
        const netGold =
            filteredStats.gold +
            filteredStats.fishGold -
            filteredStats.baitCost;
        const averageNetGold =
            filteredStats.casts > 0 ? netGold / filteredStats.casts : 0;

        ui.statsScope.textContent = getEarningsScopeLabel(
            earningsStats,
            filter,
        );
        ui.statsStart.textContent = filteredStats.startedAt
            ? `统计起点：${new Date(filteredStats.startedAt).toLocaleString()}`
            : '当前范围暂无数据';
        ui.statsCasts.textContent = formatStatNumber(filteredStats.casts);
        ui.statsFish.textContent = formatStatNumber(filteredStats.fish);
        ui.statsGold.textContent = formatStatNumber(filteredStats.gold, 2);
        ui.statsFishGold.textContent = formatStatNumber(
            filteredStats.fishGold,
            2,
        );
        ui.statsBaitCost.textContent = formatStatNumber(
            filteredStats.baitCost,
            2,
        );
        ui.statsNetGold.textContent = formatStatNumber(netGold, 2);
        ui.statsXp.textContent = formatStatNumber(filteredStats.xp, 2);
        ui.statsRelics.textContent = formatStatNumber(filteredStats.relics, 2);
        ui.statsTreasures.textContent = formatStatNumber(
            filteredStats.treasureChests,
        );
        ui.statsGears.textContent = formatStatNumber(filteredStats.gears);
        ui.statsNetAverage.textContent = formatStatNumber(averageNetGold, 1);
        renderSignedStatTone(ui.statsNetGold, netGold);
        renderSignedStatTone(ui.statsNetAverage, averageNetGold);

        ui.statsCostNote.hidden = filteredStats.unknownBaitCostCasts === 0;
        ui.statsCostNote.textContent =
            filteredStats.unknownBaitCostCasts > 0
                ? `${formatStatNumber(filteredStats.unknownBaitCostCasts)} 次抛竿未获取到鱼饵价格，成本和净收益暂未包含。`
                : '';

        const rarityEntries = Object.entries(filteredStats.rarityCounts).sort(
            (left, right) => right[1] - left[1],
        );

        renderStatsList(ui.rarityStats, rarityEntries, '暂无收获');
    }

    function setPanelCollapsed(nextCollapsed) {
        panelCollapsed = Boolean(nextCollapsed);
        savePanelCollapsed(panelCollapsed);
        renderPanelCollapsed();
    }

    function renderPanelCollapsed() {
        if (!ui?.panel || !ui?.collapseToggle) {
            return;
        }

        const action = panelCollapsed ? '展开' : '收起';

        ui.panel.dataset.collapsed = panelCollapsed ? 'true' : 'false';
        ui.collapseToggle.textContent = panelCollapsed ? '＋' : '−';
        ui.collapseToggle.title = `${action}控制面板`;
        ui.collapseToggle.setAttribute('aria-label', `${action}控制面板`);
        ui.collapseToggle.setAttribute(
            'aria-expanded',
            panelCollapsed ? 'false' : 'true',
        );
    }

    function renderPushKeyHelp() {
        if (ui?.pushKeyHelp) {
            ui.pushKeyHelp.hidden = Boolean(getState().pushKey);
        }
    }

    function renderNotificationSettings() {
        if (!ui?.notificationModeInputs?.length) {
            return;
        }

        const { notificationMode } = getState();

        for (const input of ui.notificationModeInputs) {
            input.checked = input.value === notificationMode;
        }

        const showBrowserSettings = notificationMode === 'browser';

        ui.serverNotificationSettings.hidden = showBrowserSettings;
        ui.browserNotificationSettings.hidden = !showBrowserSettings;
        renderPushKeyHelp();

        if (!showBrowserSettings) {
            return;
        }

        const supported = typeof window.Notification === 'function';
        const permission = supported
            ? window.Notification.permission
            : 'unsupported';
        const permissionLabels = {
            granted: '已授权',
            denied: '已拒绝',
            default: '未授权',
            unsupported: '当前浏览器不支持',
        };

        ui.browserNotificationPermission.textContent =
            permissionLabels[permission] ?? '未知';
        ui.browserNotificationPermissionButton.disabled =
            permission === 'granted' ||
            permission === 'denied' ||
            permission === 'unsupported';
        ui.browserNotificationPermissionButton.textContent =
            permission === 'granted'
                ? '浏览器通知已授权'
                : permission === 'denied'
                  ? '请在浏览器设置中重新授权'
                  : permission === 'unsupported'
                    ? '当前浏览器不支持通知'
                    : '授权浏览器通知';
    }

    function renderScheduleStatus(remaining = null) {
        if (!ui?.scheduleStatus) {
            return;
        }

        const {
            enabled,
            scheduleDuration,
            scheduleEndsAt,
            schedulePhase,
            scheduleSettings,
        } = getState();

        if (!scheduleSettings.enabled) {
            ui.scheduleStatus.textContent = '未启用';
            return;
        }

        if (scheduleEndsAt === 0 || scheduleDuration === 0) {
            ui.scheduleStatus.textContent = enabled
                ? '等待开始本轮运行'
                : '脚本启动后开始';
            return;
        }

        if (schedulePhase === 'rest') {
            const restRemaining = remaining ?? scheduleEndsAt - Date.now();

            ui.scheduleStatus.textContent = `休息中，剩余 ${formatScheduleDuration(restRemaining)}`;
            return;
        }

        ui.scheduleStatus.textContent = `本轮运行 ${formatScheduleDuration(scheduleDuration)}`;
    }

    function renderScheduleSettings() {
        if (!ui?.scheduleEnabledToggle) {
            return;
        }

        const { scheduleSettings } = getState();

        ui.scheduleEnabledToggle.checked = scheduleSettings.enabled;
        ui.scheduleEnabledToggle.setAttribute(
            'aria-checked',
            scheduleSettings.enabled ? 'true' : 'false',
        );
        ui.scheduleSettings.hidden = !scheduleSettings.enabled;
        ui.scheduleWorkMinutes.value = String(scheduleSettings.workMinutes);
        ui.scheduleRestMinutes.value = String(scheduleSettings.restMinutes);
        renderScheduleStatus();
    }

    function renderAutoBiomeSettings() {
        if (!ui?.autoBiomeToggle) {
            return;
        }

        const {
            autoBiomeCompetitionStatus,
            autoBiomeLastUpdatedAt,
            autoBiomeSettings,
            autoBiomeStatus,
        } = getState();

        ui.autoBiomeToggle.checked = autoBiomeSettings.enabled;
        ui.autoBiomeToggle.setAttribute(
            'aria-checked',
            autoBiomeSettings.enabled ? 'true' : 'false',
        );
        ui.autoBiomeStatus.textContent = autoBiomeStatus;
        ui.autoBiomeCompetitionToggle.checked =
            autoBiomeSettings.preferCompetitionBiomes;
        ui.autoBiomeCompetitionToggle.setAttribute(
            'aria-checked',
            autoBiomeSettings.preferCompetitionBiomes ? 'true' : 'false',
        );
        ui.autoBiomeGoldBreezeToggle.checked =
            autoBiomeSettings.chaseGoldBreeze;
        ui.autoBiomeGoldBreezeToggle.setAttribute(
            'aria-checked',
            autoBiomeSettings.chaseGoldBreeze ? 'true' : 'false',
        );
        ui.autoBiomeCompetitionStatus.textContent = autoBiomeCompetitionStatus;

        for (const input of ui.autoBiomeWeightInputs) {
            input.checked =
                Number(input.value) === autoBiomeSettings.biomeWeight;
        }

        ui.autoBiomeUpdatedAt.textContent = autoBiomeLastUpdatedAt
            ? new Date(autoBiomeLastUpdatedAt).toLocaleTimeString()
            : '等待接口数据';
    }

    function renderAutoBaitSettings() {
        if (!ui?.autoBaitToggle) {
            return;
        }

        const { autoBaitLastPurchasedAt, autoBaitSettings, autoBaitStatus } =
            getState();

        ui.autoBaitToggle.checked = autoBaitSettings.enabled;
        ui.autoBaitToggle.setAttribute(
            'aria-checked',
            autoBaitSettings.enabled ? 'true' : 'false',
        );
        ui.autoBaitStatus.textContent = autoBaitStatus;
        ui.autoBaitRegularGrade.value = autoBaitSettings.regularBaitGrade;
        ui.autoBaitPersonalGrade.value =
            autoBaitSettings.personalCompetitionBaitGrade;
        ui.autoBaitGuildGrade.value =
            autoBaitSettings.guildCompetitionBaitGrade;
        ui.autoBaitGoldBreezeGrade.value = autoBaitSettings.goldBreezeBaitGrade;
        ui.autoBaitPurchaseSettings.hidden =
            autoBaitSettings.regularBaitGrade === 'default' &&
            autoBaitSettings.personalCompetitionBaitGrade === 'default' &&
            autoBaitSettings.guildCompetitionBaitGrade === 'default' &&
            autoBaitSettings.goldBreezeBaitGrade === 'default';
        ui.autoBaitMinimumQuantity.value = String(
            autoBaitSettings.minimumQuantity,
        );
        ui.autoBaitPurchaseQuantity.value = String(
            autoBaitSettings.purchaseQuantity,
        );
        ui.autoBaitLastPurchasedAt.textContent = autoBaitLastPurchasedAt
            ? new Date(autoBaitLastPurchasedAt).toLocaleTimeString()
            : '暂无';
    }

    function renderIdleReloadSettings() {
        if (!ui?.idleReloadMinutes) {
            return;
        }

        ui.idleReloadMinutes.value = String(
            getState().idleReloadSettings.minutes,
        );
    }

    function renderToggle() {
        if (!ui?.toggle) {
            return;
        }

        const { enabled } = getState();

        ui.toggle.textContent = enabled ? '停止' : '启动';
        ui.toggle.dataset.enabled = enabled ? 'true' : 'false';
    }

    function renderCaptchaBypassToggle() {
        if (!ui?.captchaBypassToggle) {
            return;
        }

        const { captchaBypassEnabled } = getState();

        ui.captchaBypassToggle.checked = captchaBypassEnabled;
        ui.captchaBypassToggle.setAttribute(
            'aria-checked',
            captchaBypassEnabled ? 'true' : 'false',
        );
    }

    createPanel();

    return {
        renderAutoBaitSettings,
        renderAutoBiomeSettings,
        renderCaptchaBypassToggle,
        renderEarningsStats,
        renderIdleReloadSettings,
        renderNotificationSettings,
        renderScheduleSettings,
        renderScheduleStatus,
        renderToggle,
        setNextDelay,
        setStatus,
        updateClickCount,
    };
}
