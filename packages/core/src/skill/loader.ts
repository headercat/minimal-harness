import { glob, readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { Skill } from './types.js';

export interface LoadSkillsOptions {
  encoding?: BufferEncoding;
}

export async function loadSkills(pattern: string, options?: LoadSkillsOptions): Promise<Skill[]> {
  const skills: Skill[] = [];

  for await (const filePath of glob(pattern)) {
    const content = await readFile(filePath, options?.encoding ?? 'utf-8');
    const skill = parseSkillFile(filePath, content);
    skills.push(skill);
  }

  return skills;
}

function parseFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  if (!content.startsWith('---')) {
    return { frontmatter: {}, body: content.trim() };
  }

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    return { frontmatter: {}, body: content.trim() };
  }

  const frontmatter: Record<string, string> = {};
  const fmLines = content.slice(3, endIndex).trim().split('\n');

  for (const line of fmLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex !== -1) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      if (key) frontmatter[key] = value;
    }
  }

  const body = content.slice(endIndex + 3).trim();
  return { frontmatter, body };
}

function parseSkillFile(filePath: string, content: string): Skill {
  const { frontmatter, body } = parseFrontmatter(content);
  const name = frontmatter.name ?? basename(filePath, extname(filePath));
  const description = frontmatter.description;
  return { name, ...(description ? { description } : {}), content: body };
}
