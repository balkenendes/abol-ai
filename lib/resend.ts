import { Resend } from 'resend'

// Lazy init — avoids throwing at build time when env vars aren't set
function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? 'placeholder')
}

const FROM = 'Pipeloop <noreply@pipeloop.ai>'
export const SAM_EMAIL = 'sam@baselinез.nl' // update to your real email

export async function sendAlexanderReport(params: {
  toEmail: string
  reportDate: string
  reportHtml: string
}) {
  return getResend().emails.send({
    from: 'Alexander (Pipeloop CEO) <alexander@pipeloop.ai>',
    to: params.toEmail,
    subject: `[Pipeloop] Daily Briefing — ${params.reportDate}`,
    html: `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto; background: #0a0a0f; color: #e0e0e0; padding: 32px;">
        <div style="border-bottom: 1px solid #222233; padding-bottom: 16px; margin-bottom: 24px;">
          <span style="color: #ffffff; font-size: 18px; font-weight: bold;">Pipeloop</span>
          <span style="color: #00d4aa; font-size: 18px; font-weight: bold;">.ai</span>
          <span style="color: #555566; margin-left: 12px; font-size: 14px;">Daily Briefing · ${params.reportDate}</span>
        </div>
        <div style="white-space: pre-wrap; line-height: 1.7; font-size: 14px; color: #d0d0e0;">
          ${params.reportHtml}
        </div>
        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #222233; font-size: 12px; color: #555566;">
          Alexander · AI CEO · Pipeloop.ai
        </div>
      </div>
    `,
  })
}

export async function sendWarmLeadAlert(params: {
  toEmail: string
  leadName: string
  company: string
  score: number
  leadUrl: string
}) {
  return getResend().emails.send({
    from: FROM,
    to: params.toEmail,
    subject: `Warm Lead: ${params.leadName} at ${params.company} (score ${params.score}/10)`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px;">
        <h2 style="color: #f97316;">Warm Lead Alert</h2>
        <p><strong>${params.leadName}</strong> at ${params.company} reached score ${params.score}/10.</p>
        <p>This contact is ready for a personal follow-up.</p>
        <a href="${params.leadUrl}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #00d4aa; color: #0a0a0f; text-decoration: none; border-radius: 8px; font-weight: bold;">
          View Lead
        </a>
      </div>
    `,
  })
}

export async function sendReviewQueueAlert(params: {
  toEmail: string
  pendingCount: number
  reviewUrl: string
}) {
  return getResend().emails.send({
    from: FROM,
    to: params.toEmail,
    subject: `[Pipeloop] ${params.pendingCount} messages waiting for your approval`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px;">
        <p>You have <strong>${params.pendingCount}</strong> outreach message${params.pendingCount !== 1 ? 's' : ''} waiting for your approval.</p>
        <a href="${params.reviewUrl}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #00d4aa; color: #0a0a0f; text-decoration: none; border-radius: 8px; font-weight: bold;">
          Review Now
        </a>
      </div>
    `,
  })
}
