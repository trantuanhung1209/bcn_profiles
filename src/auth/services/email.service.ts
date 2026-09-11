import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { Resend } from 'resend';
import { MailQueueService } from './mail-queue.service';

type OutboundMail = {
  to: string;
  subject: string;
  html: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly from: string;

  constructor(
    private configService: ConfigService,
    private readonly mailQueueService: MailQueueService,
  ) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY')?.trim();
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is required');
    }

    this.resend = new Resend(apiKey);
    this.from =
      this.configService.get<string>('EMAIL_FROM')?.trim() ||
      'BCN Support <onboarding@resend.dev>';
  }

  private async enqueueMail(name: string, mail: OutboundMail): Promise<void> {
    await this.mailQueueService.enqueue(name, async () => {
      const { error } = await this.resend.emails.send({
        from: this.from,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
      });

      if (error) {
        throw new Error(
          typeof error === 'object' && error && 'message' in error
            ? String((error as { message: string }).message)
            : 'Resend send failed',
        );
      }
    });
  }

  private compileTemplate(
    templateName: string,
    data: Record<string, unknown>,
  ): string {
    const templatePath = path.join(
      process.cwd(),
      'dist',
      'auth',
      'templates',
      `${templateName}.hbs`,
    );

    let templateSource: string;
    try {
      templateSource = fs.readFileSync(templatePath, 'utf-8');
    } catch {
      const devTemplatePath = path.join(
        process.cwd(),
        'src',
        'auth',
        'templates',
        `${templateName}.hbs`,
      );
      templateSource = fs.readFileSync(devTemplatePath, 'utf-8');
    }

    return Handlebars.compile(templateSource)(data);
  }

  async sendResetPasswordEmail(
    email: string,
    otp: string,
    fullName?: string,
  ): Promise<void> {
    const html = this.compileTemplate('reset-password', {
      fullName,
      otp,
      year: new Date().getFullYear(),
    });

    try {
      await this.enqueueMail('reset-password-email', {
        to: email,
        subject: 'Đặt lại mật khẩu - BCN Profiles',
        html,
      });
    } catch (error) {
      this.logger.error(
        'Error sending email',
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error('Không thể gửi email. Vui lòng thử lại sau.');
    }
  }

  async sendRejectionEmail(email: string, fullName?: string): Promise<void> {
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #dc2626;">Yêu cầu đăng ký không được chấp thuận</h2>
          <p>Xin chào${fullName ? ` <b>${fullName}</b>` : ''},</p>
          <p>Rất tiếc, yêu cầu đăng ký tài khoản BCN Profiles của bạn đã không được admin chấp thuận.</p>
          <p>Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ với chúng tôi để được hỗ trợ.</p>
          <p style="margin-top:24px;color:#6b7280;font-size:12px;">© ${new Date().getFullYear()} BCN Profiles</p>
        </div>
      `;

    try {
      await this.enqueueMail('rejection-email', {
        to: email,
        subject: 'Yêu cầu đăng ký không được chấp thuận - BCN Profiles',
        html,
      });
    } catch (error) {
      this.logger.error(
        'Error sending rejection email',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async sendApprovalEmail(email: string, fullName?: string): Promise<void> {
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #16a34a;">Tài khoản đã được phê duyệt ✅</h2>
          <p>Xin chào${fullName ? ` <b>${fullName}</b>` : ''},</p>
          <p>Tài khoản BCN Profiles của bạn đã được admin phê duyệt. Bạn có thể đăng nhập ngay bây giờ.</p>
          <a href="${this.configService.get<string>('APP_URL') || 'http://localhost:3000'}/auth/login"
             style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none;margin-top:16px;"
          >Đăng nhập ngay</a>
          <p style="margin-top:24px;color:#6b7280;font-size:12px;">© ${new Date().getFullYear()} BCN Profiles</p>
        </div>
      `;

    try {
      await this.enqueueMail('approval-email', {
        to: email,
        subject: 'Tài khoản của bạn đã được phê duyệt - BCN Profiles',
        html,
      });
    } catch (error) {
      this.logger.error(
        'Error sending approval email',
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error('Không thể gửi email thông báo. Vui lòng thử lại sau.');
    }
  }

  async sendChangeEmailOtp(
    newEmail: string,
    otp: string,
    fullName?: string,
  ): Promise<void> {
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Xác nhận đổi email</h2>
          <p>Xin chào${fullName ? ` <b>${fullName}</b>` : ''},</p>
          <p>Mã OTP xác nhận email mới của bạn là:</p>
          <div style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #4F46E5; margin: 24px 0;">${otp}</div>
          <p>Mã có hiệu lực trong <b>15 phút</b>. Không chia sẻ mã này cho bất kỳ ai.</p>
          <p>Nếu bạn không yêu cầu đổi email, hãy bỏ qua email này.</p>
        </div>
      `;

    try {
      await this.enqueueMail('change-email-otp', {
        to: newEmail,
        subject: 'Xác nhận đổi email - BCN Profiles',
        html,
      });
    } catch (error) {
      this.logger.error(
        'Error sending email',
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error('Không thể gửi email. Vui lòng thử lại sau.');
    }
  }

  async sendTwoFactorOTP(
    email: string,
    otp: string,
    fullName?: string,
  ): Promise<void> {
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Mã xác nhận 2FA</h2>
          <p>Xin chào${fullName ? ` <b>${fullName}</b>` : ''},</p>
          <p>Bạn đã yêu cầu xác nhận 2FA. Mã OTP của bạn là:</p>
          <div style="font-size: 42px; font-weight: bold; letter-spacing: 8px; color: #16a34a; margin: 24px 0; text-align: center;">${otp}</div>
          <p style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; margin: 16px 0;">
            Mã có hiệu lực trong <b>15 phút</b>. Không chia sẻ mã này cho bất kỳ ai.
          </p>
          <p style="color: #6b7280; font-size: 12px;">Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.</p>
          <p style="margin-top:24px;color:#6b7280;font-size:12px;">© ${new Date().getFullYear()} BCN Profiles</p>
        </div>
      `;

    try {
      await this.enqueueMail('two-factor-otp', {
        to: email,
        subject: 'Mã xác nhận 2FA - BCN Profiles',
        html,
      });
    } catch (error) {
      this.logger.error(
        'Error sending 2FA OTP email',
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error('Không thể gửi email OTP. Vui lòng thử lại sau.');
    }
  }

  async sendTwoFactorRecoveryEmail(
    email: string,
    recoveryCode: string,
    fullName?: string,
  ): Promise<void> {
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #dc2626;">Yêu cầu khôi phục 2FA</h2>
          <p>Xin chào${fullName ? ` <b>${fullName}</b>` : ''},</p>
          <p>Chúng tôi nhận được yêu cầu khôi phục 2FA cho tài khoản của bạn. Dưới đây là mã khôi phục (OTP):</p>
          <div style="font-size: 42px; font-weight: bold; letter-spacing: 8px; color: #dc2626; margin: 24px 0; text-align: center;">${recoveryCode}</div>
          <p style="background-color: #fef2f2; padding: 12px; border-radius: 6px; margin: 16px 0; border-left: 4px solid #dc2626;">
            Mã có hiệu lực trong <b>30 phút</b>. Mã này chỉ có thể sử dụng một lần.
          </p>
          <p><strong>Hãy chỉ sử dụng mã này nếu đó là bạn!</strong> Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280;">
            Nếu bạn có thắc mắc, vui lòng liên hệ với BCN Support.
          </p>
          <p style="margin-top:24px;color:#6b7280;font-size:12px;">© ${new Date().getFullYear()} BCN Profiles</p>
        </div>
      `;

    try {
      await this.enqueueMail('two-factor-recovery-email', {
        to: email,
        subject: '2FA Recovery - BCN Profiles',
        html,
      });
    } catch (error) {
      this.logger.error(
        'Error sending 2FA recovery email',
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error('Không thể gửi email khôi phục. Vui lòng thử lại sau.');
    }
  }

  async sendAdminResetNotification(
    email: string,
    fullName?: string,
  ): Promise<void> {
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Thông báo: 2FA đã được reset</h2>
          <p>Xin chào${fullName ? ` <b>${fullName}</b>` : ''},</p>
          <p>Admin của BCN Profiles đã reset xác thực 2 lớp (2FA) của tài khoản của bạn.</p>
          <p style="background-color: #fef3c7; padding: 12px; border-radius: 6px; margin: 16px 0; border-left: 4px solid #f59e0b;">
            <strong>Bạn cần thiết lập lại 2FA sau lần đăng nhập tiếp theo.</strong>
          </p>
          <p>Nếu bạn không yêu cầu, vui lòng liên hệ với BCN Support ngay lập tức.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280;">
            © ${new Date().getFullYear()} BCN Profiles
          </p>
        </div>
      `;

    try {
      await this.enqueueMail('admin-reset-notification', {
        to: email,
        subject: '2FA của bạn đã được reset - BCN Profiles',
        html,
      });
    } catch (error) {
      this.logger.error(
        'Error sending admin reset notification',
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error('Không thể gửi email thông báo. Vui lòng thử lại sau.');
    }
  }

  async sendTwoFactorEnforcedNotification(
    email: string,
    fullName?: string,
  ): Promise<void> {
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #EF4444;">Thông báo: 2FA bắt buộc</h2>
          <p>Xin chào${fullName ? ` <b>${fullName}</b>` : ''},</p>
          <p>Admin của BCN Profiles đã yêu cầu bạn thiết lập xác thực 2 lớp (2FA) bắt buộc cho tài khoản của bạn.</p>
          <p style="background-color: #fee2e2; padding: 12px; border-radius: 6px; margin: 16px 0; border-left: 4px solid #ef4444;">
            <strong>🔒 Từ lần đăng nhập tiếp theo, bạn PHẢI thiết lập 2FA.</strong>
          </p>
          <p><strong>Các bước thiết lập 2FA:</strong></p>
          <ol>
            <li>Đăng nhập vào tài khoản của bạn</li>
            <li>Truy cập phần cài đặt bảo mật</li>
            <li>Thiết lập ứng dụng Authenticator (Google Authenticator, Authy, v.v.)</li>
            <li>Lưu mã khôi phục ở nơi an toàn</li>
          </ol>
          <p>Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với BCN Support.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280;">
            © ${new Date().getFullYear()} BCN Profiles
          </p>
        </div>
      `;

    try {
      await this.enqueueMail('2fa-enforced-notification', {
        to: email,
        subject: '⚠️ 2FA bắt buộc - BCN Profiles',
        html,
      });
    } catch (error) {
      this.logger.error(
        'Error sending 2FA enforced notification',
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error('Không thể gửi email thông báo. Vui lòng thử lại sau.');
    }
  }

  async sendTwoFactorOptionalNotification(
    email: string,
    fullName?: string,
  ): Promise<void> {
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #10B981;">Thông báo: 2FA bây giờ tùy chọn</h2>
          <p>Xin chào${fullName ? ` <b>${fullName}</b>` : ''},</p>
          <p>Admin của BCN Profiles đã cập nhật yêu cầu bảo mật của bạn.</p>
          <p style="background-color: #ecfdf5; padding: 12px; border-radius: 6px; margin: 16px 0; border-left: 4px solid #10b981;">
            <strong>✔️ Xác thực 2 lớp (2FA) bây giờ là TÙY CHỌN cho tài khoản của bạn.</strong>
          </p>
          <p>Bạn có thể:</p>
          <ul>
            <li>Tiếp tục sử dụng 2FA để bảo vệ tài khoản của bạn</li>
            <li>Bỏ qua 2FA và đăng nhập bình thường</li>
          </ul>
          <p>Lựa chọn bảo mật được quyết định bởi bạn. Nếu bạn muốn thiết lập 2FA để bảo vệ thêm, vui lòng truy cập cài đặt bảo mật.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280;">
            © ${new Date().getFullYear()} BCN Profiles
          </p>
        </div>
      `;

    try {
      await this.enqueueMail('2fa-optional-notification', {
        to: email,
        subject: '✅ 2FA bây giờ tùy chọn - BCN Profiles',
        html,
      });
    } catch (error) {
      this.logger.error(
        'Error sending 2FA optional notification',
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error('Không thể gửi email thông báo. Vui lòng thử lại sau.');
    }
  }
}
