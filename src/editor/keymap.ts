import { closeBracketsKeymap } from '@codemirror/autocomplete';
import {
  defaultKeymap,
  historyKeymap,
  indentWithTab,
  moveLineDown,
  moveLineUp,
  toggleComment,
} from '@codemirror/commands';
import { foldKeymap } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import { keymap } from '@codemirror/view';

export interface KeymapOptions {
  onSave(): void;
}

export function createKeymap(options: KeymapOptions) {
  return keymap.of([
    {
      key: 'Mod-s',
      run: () => {
        options.onSave();
        return true;
      },
    },
    { key: 'Mod-/', run: toggleComment },
    { key: 'Mod-Shift-ArrowUp', run: moveLineUp },
    { key: 'Mod-Shift-ArrowDown', run: moveLineDown },
    ...defaultKeymap,
    ...historyKeymap,
    ...searchKeymap,
    ...foldKeymap,
    ...closeBracketsKeymap,
    indentWithTab,
  ]);
}
