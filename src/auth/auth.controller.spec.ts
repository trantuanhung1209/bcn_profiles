import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TwoFactorAuthService } from './services/two-factor-auth.service';
import { EmailService } from './services/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { TwoFactorSetupGuard } from './guards/two-factor-setup.guard';
import { TwoFactorRecoveryGuard } from './guards/two-factor-recovery.guard';
import { RolesGuard } from './guards/roles.guard';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: TwoFactorAuthService, useValue: {} },
        { provide: EmailService, useValue: {} },
        { provide: PrismaService, useValue: {} },
      ],
    })
      .overrideGuard(TwoFactorSetupGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TwoFactorRecoveryGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
