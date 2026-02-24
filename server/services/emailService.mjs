// services/emailService.mjs – Daily alert email for Warning and Critical exports.
// Uses nodemailer. Configure SMTP via environment variables or .env file.

import nodemailer from 'nodemailer';

/**
 * Create a nodemailer transporter from environment config.
 * Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in environment.
 */
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '25', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
  });
}

/**
 * Format alert entries into a plain-text email body.
 * @param {Array} alertEntries
 * @param {object} alertsConfig
 * @returns {string}
 */
function formatAlertBody(alertEntries, alertsConfig) {
  const lines = [
    'NAS Monitoring Dashboard – Daily Alert Report',
    `Generated: ${new Date().toISOString()}`,
    `Warning threshold:  ${alertsConfig.warning_threshold}%`,
    `Critical threshold: ${alertsConfig.critical_threshold}%`,
    '',
    'Exports requiring attention:',
    '─'.repeat(60),
  ];

  for (const entry of alertEntries) {
    lines.push(
      `[${entry.status.toUpperCase()}] ${entry.filer}:${entry.export}`,
      `  Mountpoint:  ${entry.mountpoint}`,
      `  Used:        ${entry.percent_used.toFixed(1)}%`,
      `  Used KB:     ${entry.used_kb.toLocaleString()}`,
      `  Total KB:    ${entry.total_kb.toLocaleString()}`,
      `  Free KB:     ${entry.free_kb.toLocaleString()}`,
      '',
    );
  }

  lines.push('─'.repeat(60));
  lines.push('NAS Monitoring Dashboard');

  return lines.join('\n');
}

/**
 * Send daily alert email to all configured recipients.
 * @param {Array} alertEntries
 * @param {object} alertsConfig
 */
async function sendAlerts(alertEntries, alertsConfig) {
  if (!alertsConfig.enabled) return;
  if (!alertsConfig.recipients || alertsConfig.recipients.length === 0) {
    console.log('[emailService] No recipients configured. Skipping alert email.');
    return;
  }

  const criticalCount = alertEntries.filter(e => e.status === 'Critical').length;
  const warningCount  = alertEntries.filter(e => e.status === 'Warning').length;

  const subject = `NAS Alert: ${criticalCount} Critical, ${warningCount} Warning exports`;
  const body = formatAlertBody(alertEntries, alertsConfig);

  const transporter = createTransporter();

  await transporter.sendMail({
    from:    process.env.SMTP_FROM || 'nas-dashboard@localhost',
    to:      alertsConfig.recipients.join(', '),
    subject,
    text:    body,
  });

  console.log(`[emailService] Alert email sent to ${alertsConfig.recipients.length} recipients.`);
}

export { sendAlerts };
