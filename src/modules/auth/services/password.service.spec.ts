import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
  });

  describe('hash', () => {
    it('should hash a password', async () => {
      const password = 'StrongPassword123!';

      const hash = await service.hash(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.startsWith('$2')).toBe(true);
    });

    it('should generate different hashes for the same password', async () => {
      const password = 'StrongPassword123!';

      const firstHash = await service.hash(password);
      const secondHash = await service.hash(password);

      expect(firstHash).not.toBe(secondHash);
    }, 15000);
  });

  describe('compare', () => {
    it('should return true for the correct password', async () => {
      const password = 'StrongPassword123!';
      const hash = await service.hash(password);

      const result = await service.compare(password, hash);

      expect(result).toBe(true);
    }, 15000);

    it('should return false for an incorrect password', async () => {
      const password = 'StrongPassword123!';
      const wrongPassword = 'WrongPassword123!';
      const hash = await service.hash(password);

      const result = await service.compare(wrongPassword, hash);

      expect(result).toBe(false);
    }, 15000);
  });
});
