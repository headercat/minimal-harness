import type { Skill } from './types.js';

export type SkillStrategy = 'append' | 'prepend' | ((skills: Skill[], base: string) => string);

export interface SkillInjectorConfig {
  items?: Skill[];
  resolve?: () => Skill[] | Promise<Skill[]>;
  strategy?: SkillStrategy;
}

export class SkillInjector {
  constructor(config: SkillInjectorConfig) {
    void config;
    throw new Error('Not implemented');
  }

  async build(basePrompt: string): Promise<string> {
    void basePrompt;
    throw new Error('Not implemented');
  }
}
