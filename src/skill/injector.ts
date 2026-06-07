import type { Skill } from './types.js';

export type SkillStrategy = 'append' | 'prepend' | ((skills: Skill[], base: string) => string);

export interface SkillInjectorConfig {
  items?: Skill[];
  resolve?: () => Skill[] | Promise<Skill[]>;
  strategy?: SkillStrategy;
}

export class SkillInjector {
  private config: SkillInjectorConfig;

  constructor(config: SkillInjectorConfig) {
    this.config = config;
  }

  async build(basePrompt: string): Promise<string> {
    const skills = this.config.items ?? (await this.config.resolve?.()) ?? [];
    if (skills.length === 0) return basePrompt;

    const strategy = this.config.strategy ?? 'append';

    if (typeof strategy === 'function') {
      return strategy(skills, basePrompt);
    }

    const skillsBlock = skills
      .map((s) => {
        const header = s.name + (s.description ? `: ${s.description}` : '');
        return `## ${header}\n${s.content}`;
      })
      .join('\n\n');

    if (strategy === 'prepend') {
      return `${skillsBlock}\n\n${basePrompt}`;
    }

    return `${basePrompt}\n\n${skillsBlock}`;
  }
}
