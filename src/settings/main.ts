import '@work-studio/sdk/global';
import '../page/mock';
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type EditorSettings,
} from '../shared/settings';

const bridge = window.workStudio;
const app = document.querySelector<HTMLDivElement>('#app');
const PLUGIN_ID = 'text-editor';

let settings: EditorSettings = { ...DEFAULT_SETTINGS };

function status(text: string, error = false): void {
  const node = app?.querySelector<HTMLParagraphElement>('#status');
  if (!node) return;
  node.textContent = text;
  node.classList.toggle('is-error', error);
}

function save(patch: Partial<EditorSettings>): void {
  settings = { ...settings, ...patch };
  void bridge
    .command(PLUGIN_ID, 'settings', 'set', patch)
    .then((result) => {
      if (!result.ok) throw new Error(result.error.message);
      status('已保存');
    })
    .catch((error: unknown) => {
      status(error instanceof Error ? error.message : String(error), true);
    });
}

function render(): void {
  if (!app) return;
  app.innerHTML = `
    <main>
      <h1>纯文本编辑器 设置</h1>

      <div class="field">
        <label for="wrap">
          <span>自动换行</span>
          <small>长行在编辑器中折行显示，不改变文件内容。</small>
        </label>
        <input id="wrap" type="checkbox" ${settings.lineWrap ? 'checked' : ''} />
      </div>

      <div class="field">
        <label for="size">
          <span>字号</span>
          <small>11 - 24 px</small>
        </label>
        <input id="size" type="number" min="11" max="24" step="1" value="${settings.fontSize}" />
      </div>

      <div class="field">
        <label for="tabs">
          <span>Tab 宽度</span>
          <small>1 - 8 个空格宽度</small>
        </label>
        <input id="tabs" type="number" min="1" max="8" step="1" value="${settings.tabSize}" />
      </div>

      <div class="field">
        <label for="lines">
          <span>显示行号</span>
          <small>在编辑器左侧显示行号。</small>
        </label>
        <input id="lines" type="checkbox" ${settings.lineNumbers ? 'checked' : ''} />
      </div>

      <div class="field">
        <label for="active">
          <span>高亮当前行</span>
          <small>光标所在行使用浅色背景。</small>
        </label>
        <input id="active" type="checkbox" ${settings.highlightActiveLine ? 'checked' : ''} />
      </div>

      <div class="field">
        <label for="whitespace">
          <span>显示空白字符</span>
          <small>显示空格与 Tab，便于检查缩进。</small>
        </label>
        <input id="whitespace" type="checkbox" ${settings.highlightWhitespace ? 'checked' : ''} />
      </div>

      <div class="field">
        <label for="spell">
          <span>拼写检查</span>
          <small>使用浏览器 / 系统拼写检查。</small>
        </label>
        <input id="spell" type="checkbox" ${settings.spellcheck ? 'checked' : ''} />
      </div>

      <div class="actions">
        <button id="reset" type="button">恢复默认</button>
      </div>
      <p id="status">设置会保存到插件数据目录。编码、BOM 与换行不在这里配置，由文件自身决定。</p>
    </main>`;

  const onCheckbox = (id: string, key: keyof EditorSettings): void => {
    app
      .querySelector<HTMLInputElement>(`#${id}`)
      ?.addEventListener('change', (event) => {
        save({ [key]: (event.target as HTMLInputElement).checked });
      });
  };

  onCheckbox('wrap', 'lineWrap');
  onCheckbox('lines', 'lineNumbers');
  onCheckbox('active', 'highlightActiveLine');
  onCheckbox('whitespace', 'highlightWhitespace');
  onCheckbox('spell', 'spellcheck');

  app.querySelector<HTMLInputElement>('#size')?.addEventListener('change', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) save({ fontSize: value });
  });
  app.querySelector<HTMLInputElement>('#tabs')?.addEventListener('change', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) save({ tabSize: value });
  });

  app.querySelector<HTMLButtonElement>('#reset')?.addEventListener('click', () => {
    settings = { ...DEFAULT_SETTINGS };
    render();
    void bridge
      .command(PLUGIN_ID, 'settings', 'set', settings)
      .then((result) => {
        if (!result.ok) throw new Error(result.error.message);
        status('已恢复默认');
      })
      .catch((error: unknown) => {
        status(error instanceof Error ? error.message : String(error), true);
      });
  });
}

void bridge
  .subscribe(PLUGIN_ID, 'settings')
  .then((value) => {
    settings = normalizeSettings(value);
    render();
  })
  .catch(() => {
    render();
  });

bridge.onUpdate((update) => {
  if (update.domain !== PLUGIN_ID || update.resource !== 'settings') return;
  settings = normalizeSettings(update.data);
  render();
});

window.addEventListener('beforeunload', () => {
  bridge.unsubscribe(PLUGIN_ID, 'settings');
});

render();
