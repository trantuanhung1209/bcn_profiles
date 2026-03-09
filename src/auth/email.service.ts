import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    // Cấu hình transporter với thông tin từ .env
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // STARTTLS
      family: 4, // Force IPv4 to avoid ENETUNREACH on IPv6
      auth: {
        user: this.configService.get<string>('EMAIL_USER'),
        pass: this.configService.get<string>('EMAIL_PASSWORD'),
      },
      tls: {
        rejectUnauthorized: false,
      },
    } as any);
  }

  /**
   * Compile Handlebars template từ file
   */
  private compileTemplate(templateName: string, data: any): string {
    // Sử dụng process.cwd() để lấy đúng đường dẫn root của project
    const templatePath = path.join(process.cwd(), 'dist', 'auth', 'templates', `${templateName}.hbs`);
    
    // Fallback về src nếu đang ở development mode
    let templateSource: string;
    try {
      templateSource = fs.readFileSync(templatePath, 'utf-8');
    } catch (error) {
      // Nếu không tìm thấy trong dist, thử tìm trong src (development)
      const devTemplatePath = path.join(process.cwd(), 'src', 'auth', 'templates', `${templateName}.hbs`);
      templateSource = fs.readFileSync(devTemplatePath, 'utf-8');
    }
    
    const template = Handlebars.compile(templateSource);
    return template(data);
  }

  /**
   * Gửi email reset password với OTP
   */
  async sendResetPasswordEmail(email: string, otp: string, fullName?: string): Promise<void> {
    // Compile template với data
    const html = this.compileTemplate('reset-password', {
      fullName,
      otp,
      year: new Date().getFullYear(),
    });

    const mailOptions = {
      from: `"BCN Support" <${this.configService.get<string>('EMAIL_USER')}>`,
      to: email,
      subject: 'Đặt lại mật khẩu - BCN Profiles',
      html,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending email:', error);
      throw new Error('Không thể gửi email. Vui lòng thử lại sau.');
    }
  }

  /**
   * Gửi email thông báo tài khoản bị từ chối
   */
  async sendRejectionEmail(email: string, fullName?: string): Promise<void> {
    const mailOptions = {
      from: `"BCN Support" <${this.configService.get<string>('EMAIL_USER')}>`,
      to: email,
      subject: 'Yêu cầu đăng ký không được chấp thuận - BCN Profiles',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #dc2626;">Yêu cầu đăng ký không được chấp thuận</h2>
          <p>Xin chào${fullName ? ` <b>${fullName}</b>` : ''},</p>
          <p>Rất tiếc, yêu cầu đăng ký tài khoản BCN Profiles của bạn đã không được admin chấp thuận.</p>
          <p>Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ với chúng tôi để được hỗ trợ.</p>
          <p style="margin-top:24px;color:#6b7280;font-size:12px;">© ${new Date().getFullYear()} BCN Profiles</p>
        </div>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending rejection email:', error);
    }
  }

  /**
   * Gửi email thông báo tài khoản đã được admin phê duyệt
   */
  async sendApprovalEmail(email: string, fullName?: string): Promise<void> {
    const mailOptions = {
      from: `"BCN Support" <${this.configService.get<string>('EMAIL_USER')}>`,
      to: email,
      subject: 'Tài khoản của bạn đã được phê duyệt - BCN Profiles',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #16a34a;">Tài khoản đã được phê duyệt ✅</h2>
          <p>Xin chào${fullName ? ` <b>${fullName}</b>` : ''},</p>
          <p>Tài khoản BCN Profiles của bạn đã được admin phê duyệt. Bạn có thể đăng nhập ngay bây giờ.</p>
          <a href="${this.configService.get<string>('APP_URL') || 'http://localhost:3000'}/auth/login"
             style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none;margin-top:16px;"
          >Đăng nhập ngay</a>
          <p style="margin-top:24px;color:#6b7280;font-size:12px;">© ${new Date().getFullYear()} BCN Profiles</p>
        </div>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending approval email:', error);
      throw new Error('Không thể gửi email thông báo. Vui lòng thử lại sau.');
    }
  }

  /**
   * Gửi OTP xác nhận đổi email đến địa chỉ email mới
   */
  async sendChangeEmailOtp(newEmail: string, otp: string, fullName?: string): Promise<void> {
    const mailOptions = {
      from: `"BCN Support" <${this.configService.get<string>('EMAIL_USER')}>`,
      to: newEmail,
      subject: 'Xác nhận đổi email - BCN Profiles',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Xác nhận đổi email</h2>
          <p>Xin chào${fullName ? ` <b>${fullName}</b>` : ''},</p>
          <p>Mã OTP xác nhận email mới của bạn là:</p>
          <div style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #4F46E5; margin: 24px 0;">${otp}</div>
          <p>Mã có hiệu lực trong <b>15 phút</b>. Không chia sẻ mã này cho bất kỳ ai.</p>
          <p>Nếu bạn không yêu cầu đổi email, hãy bỏ qua email này.</p>
        </div>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending email:', error);
      throw new Error('Không thể gửi email. Vui lòng thử lại sau.');
    }
  }
}
