import { describe, expect, it } from 'vitest';
import {
  extractSenderEmail,
  extractSenderDomain,
  isClaudeEmail,
  isChatGptEmail,
  isAiOfficialEmail,
  getAiServiceMatch,
} from '../src/shared/ai-filter.js';

describe('AI Official Email Filter & Anti-Spoofing', () => {
  describe('Email & Domain Extraction', () => {
    it('extracts email and domain from formatted From header with quotes and name', () => {
      const from = '"Claude Team" <no-reply@email.claude.com>';
      expect(extractSenderEmail(from)).toBe('no-reply@email.claude.com');
      expect(extractSenderDomain(from)).toBe('email.claude.com');
    });

    it('extracts email and domain from From header without quotes', () => {
      const from = 'Anthropic <no-reply-XrAnI2Snz1QjVmw9IslluQ@mail.anthropic.com>';
      expect(extractSenderEmail(from)).toBe('no-reply-xrani2snz1qjvmw9islluq@mail.anthropic.com');
      expect(extractSenderDomain(from)).toBe('mail.anthropic.com');
    });

    it('extracts email and domain from bare email address', () => {
      const from = 'noreply@tm.openai.com';
      expect(extractSenderEmail(from)).toBe('noreply@tm.openai.com');
      expect(extractSenderDomain(from)).toBe('tm.openai.com');
    });
  });

  describe('Official Claude Emails (Figure 1 Examples & Real Cases)', () => {
    it('matches Fig 1 Mail 1: "Claude Team" <no-reply@email.claude.com>', () => {
      const mail = { from: '"Claude Team" <no-reply@email.claude.com>', subject: "Welcome to Claude. Let's get you set up." };
      expect(isClaudeEmail(mail)).toBe(true);
      expect(isChatGptEmail(mail)).toBe(false);
      expect(isAiOfficialEmail(mail)).toBe(true);
      expect(getAiServiceMatch(mail)).toEqual({
        isOfficial: true,
        service: 'claude',
        label: 'Claude',
      });
    });

    it('matches Fig 1 Mail 2: Anthropic <no-reply-XrAnI2Snz1QjVmw9IslluQ@mail.anthropic.com>', () => {
      const mail = { from: 'Anthropic <no-reply-XrAnI2Snz1QjVmw9IslluQ@mail.anthropic.com>', subject: 'Secure link to log in to Claude.ai' };
      expect(isClaudeEmail(mail)).toBe(true);
      expect(isAiOfficialEmail(mail)).toBe(true);
    });

    it('matches other official Claude / Anthropic domains', () => {
      expect(isClaudeEmail({ from: 'support@anthropic.com' })).toBe(true);
      expect(isClaudeEmail({ from: 'login@claude.ai' })).toBe(true);
      expect(isClaudeEmail({ from: 'no-reply@claude.com' })).toBe(true);
    });
  });

  describe('Official ChatGPT Emails (Figure 1 Examples & Real Cases)', () => {
    it('matches Fig 1 Mail 3: ChatGPT <noreply@tm.openai.com>', () => {
      const mail = { from: 'ChatGPT <noreply@tm.openai.com>', subject: '你的 ChatGPT 临时验证码' };
      expect(isChatGptEmail(mail)).toBe(true);
      expect(isClaudeEmail(mail)).toBe(false);
      expect(isAiOfficialEmail(mail)).toBe(true);
      expect(getAiServiceMatch(mail)).toEqual({
        isOfficial: true,
        service: 'chatgpt',
        label: 'ChatGPT',
      });
    });

    it('matches other official ChatGPT / OpenAI domains', () => {
      expect(isChatGptEmail({ from: 'noreply@openai.com' })).toBe(true);
      expect(isChatGptEmail({ from: 'notifications@chatgpt.com' })).toBe(true);
      expect(isChatGptEmail({ from: 'auth@accounts.openai.com' })).toBe(true);
    });
  });

  describe('Anti-Spoofing Protection (防伪冒防护)', () => {
    it('rejects fake ChatGPT display name with non-official sender domain', () => {
      const mail = { from: '"ChatGPT Support" <spammer@evil.com>' };
      expect(isChatGptEmail(mail)).toBe(false);
      expect(isAiOfficialEmail(mail)).toBe(false);
    });

    it('rejects fake Claude display name with non-official sender domain', () => {
      const mail = { from: '"Claude Team" <phishing@hacker.net>' };
      expect(isClaudeEmail(mail)).toBe(false);
      expect(isAiOfficialEmail(mail)).toBe(false);
    });

    it('rejects domain suffix spoofing attacks (e.g. openai.com.evil.org)', () => {
      const mail = { from: 'security@openai.com.attacker.com' };
      expect(isChatGptEmail(mail)).toBe(false);
      expect(isAiOfficialEmail(mail)).toBe(false);
    });
  });

  describe('Regular Service Emails (Figure 1 Mail 4 & others)', () => {
    it('rejects Fig 1 Mail 4: mail.com Service <system@corp.mail.com>', () => {
      const mail = { from: 'mail.com Service <system@corp.mail.com>', subject: 'Welcome on board!' };
      expect(isAiOfficialEmail(mail)).toBe(false);
      expect(getAiServiceMatch(mail)).toEqual({
        isOfficial: false,
        service: null,
        label: '',
      });
    });

    it('rejects other standard provider emails', () => {
      expect(isAiOfficialEmail({ from: 'no-reply@github.com' })).toBe(false);
      expect(isAiOfficialEmail({ from: 'account-security-noreply@accountprotection.microsoft.com' })).toBe(false);
      expect(isAiOfficialEmail({ from: '' })).toBe(false);
      expect(isAiOfficialEmail({ from: undefined })).toBe(false);
    });
  });

  describe('Separate & Combined Filter Matrix (独立识别与合并识别测试)', () => {
    const mail1Claude = { from: '"Claude Team" <no-reply@email.claude.com>', subject: 'Welcome to Claude.' };
    const mail2Claude = { from: 'Anthropic <no-reply-XrAnI2Snz1QjVmw9IslluQ@mail.anthropic.com>', subject: 'Secure link' };
    const mail3Gpt = { from: 'ChatGPT <noreply@tm.openai.com>', subject: '你的 ChatGPT 临时验证码' };
    const mail4Regular = { from: 'mail.com Service <system@corp.mail.com>', subject: 'Welcome on board!' };
    const allMails = [mail1Claude, mail2Claude, mail3Gpt, mail4Regular];

    function filterMails(mails: typeof allMails, chatGptOnly: boolean, claudeOnly: boolean) {
      return mails.filter((mail) => {
        if (chatGptOnly && claudeOnly) {
          return isAiOfficialEmail(mail);
        } else if (chatGptOnly) {
          return isChatGptEmail(mail);
        } else if (claudeOnly) {
          return isClaudeEmail(mail);
        }
        return true;
      });
    }

    it('Scenario 1: Neither filter active -> returns all 4 emails', () => {
      const result = filterMails(allMails, false, false);
      expect(result).toHaveLength(4);
    });

    it('Scenario 2: Only ChatGPT active -> returns only Mail 3', () => {
      const result = filterMails(allMails, true, false);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(mail3Gpt);
    });

    it('Scenario 3: Only Claude active -> returns only Mail 1 & Mail 2', () => {
      const result = filterMails(allMails, false, true);
      expect(result).toHaveLength(2);
      expect(result).toEqual([mail1Claude, mail2Claude]);
    });

    it('Scenario 4: Both ChatGPT & Claude active -> returns Mail 1, Mail 2, Mail 3 (excludes regular Mail 4)', () => {
      const result = filterMails(allMails, true, true);
      expect(result).toHaveLength(3);
      expect(result).toEqual([mail1Claude, mail2Claude, mail3Gpt]);
      expect(result).not.toContain(mail4Regular);
    });
  });
});

