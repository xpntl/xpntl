import { EmailClient } from '@azure/communication-email';

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

let client: EmailClient | null = null;

function getClient(): EmailClient {
  if (!client) {
    const connStr = process.env.ACS_CONNECTION_STRING;
    if (!connStr) throw new Error('ACS_CONNECTION_STRING is not set');
    client = new EmailClient(connStr);
  }
  return client;
}

const FROM = process.env.EMAIL_FROM ?? 'noreply@xpntl.dev';

export async function send(msg: EmailMessage): Promise<void> {
  const emailClient = getClient();
  const poller = await emailClient.beginSend({
    senderAddress: FROM,
    content: {
      subject: msg.subject,
      html: msg.html,
      plainText: msg.text,
    },
    recipients: {
      to: [{ address: msg.to }],
    },
  });
  await poller.pollUntilDone();
}
