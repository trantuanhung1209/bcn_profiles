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
      port: 465,
      secure: true,
      family: 4, // Force IPv4 to avoid ENETUNREACH on IPv6
      auth: {
        user: this.configService.get<string>('EMAIL_USER'),
        pass: this.configService.get<string>('EMAIL_PASSWORD'),
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
      from: `"Chat App Support" <${this.configService.get<string>('EMAIL_USER')}>`,
      to: email,
      subject: 'Đặt lại mật khẩu - Chat App',
      html,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending email:', error);
      throw new Error('Không thể gửi email. Vui lòng thử lại sau.');
    }
  }
}
