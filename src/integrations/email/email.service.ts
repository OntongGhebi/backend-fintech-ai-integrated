import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly emailFrom: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const emailFrom = this.configService.get<string>('EMAIL_FROM');

    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    if (!emailFrom) {
      throw new Error('EMAIL_FROM is not configured');
    }

    this.resend = new Resend(apiKey);
    this.emailFrom = emailFrom;
  }

  async sendEmailVerification(
    email: string,
    name: string,
    verificationUrl: string,
  ): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.emailFrom,
      to: email,
      subject: 'Verify your email address',
      html: `
        <h2>Hello ${this.escapeHtml(name)},</h2>
        <p>Thank you for creating your account.</p>
        <p>Please verify your email address by clicking the button below:</p>
        <p>
          <a
            href="${this.escapeHtml(verificationUrl)}"
            style="
              display: inline-block;
              padding: 12px 20px;
              background: #000;
              color: #fff;
              text-decoration: none;
              border-radius: 6px;
            "
          >
            Verify Email
          </a>
        </p>
        <p>This verification link will expire soon.</p>
      `,
    });

    if (error) {
      this.logger.error('Failed to send verification email.');

      throw new InternalServerErrorException(
        'Failed to send verification email',
      );
    }
  }

  async sendNotificationEmail(
    email: string,
    name: string,
    title: string,
    message: string,
  ): Promise<void> {
    const safeName = this.escapeHtml(name);
    const safeTitle = this.escapeHtml(title);
    const safeMessage = this.escapeHtml(message).replace(/\r?\n/g, '<br />');

    const { error } = await this.resend.emails.send({
      from: this.emailFrom,
      to: email,
      subject: title,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>${safeTitle}</h2>
          <p>Halo ${safeName},</p>
          <p>${safeMessage}</p>
          <hr />
          <p style="font-size: 12px; color: #666;">
            Email notifikasi dari aplikasi Fintech AI.
          </p>
        </div>
      `,
    });

    if (error) {
      this.logger.error('Failed to send notification email.');

      throw new InternalServerErrorException(
        'Failed to send notification email',
      );
    }

    this.logger.log('Notification email sent successfully.');
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };

      return entities[character] ?? character;
    });
  }
}
