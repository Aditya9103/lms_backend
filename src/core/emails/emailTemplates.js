/**
 * emailTemplates.js — Phase 6 Handlebars-powered email renderer.
 *
 * Usage:
 *   import { renderEmail } from './emailTemplates.js';
 *   const html = await renderEmail('enrollment', { fullName, courseName, courseUrl });
 *   await sendEmail(email, 'You are enrolled!', html);
 */

import Handlebars from 'handlebars';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../logger/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, 'templates');

// Cache compiled templates in memory — avoids disk I/O on every email send
const templateCache = new Map();
let layoutTemplate = null;

const readTemplate = async (name) => {
  if (templateCache.has(name)) return templateCache.get(name);
  const src = await fs.readFile(path.join(TEMPLATES_DIR, `${name}.hbs`), 'utf-8');
  const compiled = Handlebars.compile(src);
  templateCache.set(name, compiled);
  return compiled;
};

const getLayout = async () => {
  if (layoutTemplate) return layoutTemplate;
  const src = await fs.readFile(path.join(TEMPLATES_DIR, 'layout.hbs'), 'utf-8');
  layoutTemplate = Handlebars.compile(src);
  return layoutTemplate;
};

/**
 * Renders a named email template wrapped in the base layout.
 *
 * @param {'welcome'|'enrollment'|'certificate'|'otp'} templateName
 * @param {Record<string, unknown>} data  — template variables
 * @param {string} [subject]             — injected into layout <title>
 * @returns {Promise<string>}            — rendered HTML string
 */
export const renderEmail = async (templateName, data = {}, subject = '') => {
  try {
    const layout = await getLayout();
    const body = await readTemplate(templateName);
    const renderedBody = body({ ...data, year: new Date().getFullYear() });
    return layout({ subject, body: renderedBody, year: new Date().getFullYear() });
  } catch (err) {
    logger.error(`[EmailTemplates] Failed to render "${templateName}"`, { error: err.message });
    // Fallback: return plain-text-style HTML so the email still goes out
    return `<p>${data.message ?? 'No message content.'}</p>`;
  }
};
