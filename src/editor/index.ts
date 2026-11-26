import { closeBrackets } from '@codemirror/autocomplete';
import { history } from '@codemirror/commands';
import {
  bracketMatching,
  foldGutter,
  indentOnInput,
  indentUnit,
} from '@codemirror/language';
import { search } from '@codemirror/search';
import {
  Compartment,
  EditorState,
  Transaction,
} from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  highlightWhitespace,
  lineNumbers,
  placeholder,
} from '@codemirror/view';
import { eolField, eolStateFromText, setEolState, textFromState } from './eol-field';
import { createKeymap } from './keymap';
import { languageExtension } from './language';
import { editorTheme, highlightTheme } from './theme';
import type {
  TextEditorHandle,
  TextEditorOptions,
  ThemeMode,
} from './types';

export type { TextEditorHandle, TextEditorOptions, ThemeMode } from './types';
import { normalizeEol } from '../text/eol';
import type { EditorSettings } from '../shared/settings';

function applyCssSettings(parent: HTMLElement, settings: EditorSettings): void {
  parent.style.setProperty(
    '--te-font-size',
    `${Math.max(11, Math.min(24, settings.fontSize))}px`,
  );
}

export function createTextEditor(options: TextEditorOptions): TextEditorHandle {
  const parent = options.parent;
  const themeCompartment = new Compartment();
  const wrapCompartment = new Compartment();
  const lineNumbersCompartment = new Compartment();
  const activeLineCompartment = new Compartment();
  const spellcheckCompartment = new Compartment();
  const whitespaceCompartment = new Compartment();
  const tabsCompartment = new Compartment();
  const readOnlyCompartment = new Compartment();

  let settings = { ...options.settings };
  let readOnly = options.readOnly;
  let theme: ThemeMode = options.theme;
  let applying = false;

  const contentAttributes = () =>
    EditorView.contentAttributes.of({
      spellcheck: settings.spellcheck ? 'true' : 'false',
      autocorrect: 'off',
      autocapitalize: 'off',
    });

  const lineNumberExtensions = () => [
    lineNumbers(),
    ...(settings.highlightActiveLine ? [highlightActiveLineGutter()] : []),
  ];

  const activeLineExtensions = () =>
    settings.highlightActiveLine ? [highlightActiveLine()] : [];

  const whitespaceExtensions = () =>
    settings.highlightWhitespace ? [highlightWhitespace()] : [];

  const tabExtensions = () => [
    EditorState.tabSize.of(settings.tabSize),
    indentUnit.of(' '.repeat(settings.tabSize)),
  ];

  const editableExtensions = () => [
    EditorView.editable.of(!readOnly),
    EditorState.readOnly.of(readOnly),
  ];

  const initialDoc = normalizeEol(options.value);
  const initialEol = eolStateFromText(options.value, options.defaultEol);

  applyCssSettings(parent, settings);
  parent.dataset.theme = theme;

  const view = new EditorView({
    state: EditorState.create({
      doc: initialDoc,
      extensions: [
        EditorState.allowMultipleSelections.of(true),
        EditorState.lineSeparator.of('\n'),
        highlightSpecialChars(),
        drawSelection(),
        dropCursor(),
        history(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        foldGutter(),
        search({ top: true }),
        languageExtension(options.language.id),
        highlightTheme,
        themeCompartment.of(editorTheme(theme === 'dark')),
        wrapCompartment.of(settings.lineWrap ? EditorView.lineWrapping : []),
        lineNumbersCompartment.of(lineNumberExtensions()),
        activeLineCompartment.of(activeLineExtensions()),
        spellcheckCompartment.of(contentAttributes()),
        whitespaceCompartment.of(whitespaceExtensions()),
        tabsCompartment.of(tabExtensions()),
        readOnlyCompartment.of(editableExtensions()),
        eolField.init(() => initialEol),
        createKeymap({ onSave: () => options.onSave() }),
        placeholder('开始输入…'),
        EditorView.scrollMargins.of(() => ({ top: 12, bottom: 80 })),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !applying) options.onChange();
          if (update.focusChanged || update.selectionSet || update.docChanged) {
            options.onUpdate?.(update.view);
          }
        }),
      ],
    }),
    parent,
  });

  const getText = (): string => textFromState(view.state);

  const setText: TextEditorHandle['setText'] = (text, opts) => {
    if (getText() === text) return;
    const scrollTop = view.scrollDOM.scrollTop;
    applying = true;
    try {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: normalizeEol(text),
        },
        selection: { anchor: 0 },
        effects: setEolState.of(
          eolStateFromText(text, view.state.field(eolField).defaultEol),
        ),
        ...(opts?.addToHistory === false
          ? { annotations: Transaction.addToHistory.of(false) }
          : {}),
      });
    } finally {
      applying = false;
    }
    requestAnimationFrame(() => {
      view.scrollDOM.scrollTop = Math.min(
        scrollTop,
        view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight,
      );
    });
  };

  const setSettings = (next: EditorSettings): void => {
    settings = { ...next };
    applyCssSettings(parent, settings);
    view.dispatch({
      effects: [
        wrapCompartment.reconfigure(
          settings.lineWrap ? EditorView.lineWrapping : [],
        ),
        lineNumbersCompartment.reconfigure(lineNumberExtensions()),
        activeLineCompartment.reconfigure(activeLineExtensions()),
        spellcheckCompartment.reconfigure(contentAttributes()),
        whitespaceCompartment.reconfigure(whitespaceExtensions()),
        tabsCompartment.reconfigure(tabExtensions()),
      ],
    });
  };

  const setTheme = (next: ThemeMode): void => {
    theme = next;
    parent.dataset.theme = next;
    view.dispatch({
      effects: themeCompartment.reconfigure(editorTheme(next === 'dark')),
    });
  };

  const setReadOnly = (next: boolean): void => {
    if (readOnly === next) return;
    readOnly = next;
    view.dispatch({
      effects: readOnlyCompartment.reconfigure(editableExtensions()),
    });
  };

  return {
    view,
    getText,
    setText,
    focus: () => view.focus(),
    destroy: () => view.destroy(),
    setSettings,
    setTheme,
    setReadOnly,
  };
}
