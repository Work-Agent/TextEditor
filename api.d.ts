export interface PluginApi {
  commands: {
    "text-editor.save": { input: { "ref": string; "content": string; "expectedDigest"?: string; "force"?: boolean; }; output: unknown };
  };
}
