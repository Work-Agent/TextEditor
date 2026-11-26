import type { EditorView } from '@codemirror/view';
import type { EditorSettings } from '../shared/settings';
import type { Eol } from '../shared/text-meta';
import type { LanguageInfo } from './language';

export type ThemeMode = 'light' | 'dark';

export interface TextEditorOptions {
  parent: HTMLElement;
  value: string;
  defaultEol: Eol;
  theme: ThemeMode;
  settings: EditorSettings;
  language: LanguageInfo;
  readOnly: boolean;
  onChange(): void;
  onSave(): void;
  onUpdate?(view: EditorView): void;
}

export interface TextEditorHandle {
  view: EditorView;
  getText(): string;
  setText(text: string, options?: { addToHistory?: boolean }): void;
  focus(): void;
  destroy(): void;
  setSettings(settings: EditorSettings): void;
  setTheme(theme: ThemeMode): void;
  setReadOnly(readOnly: boolean): void;
}
