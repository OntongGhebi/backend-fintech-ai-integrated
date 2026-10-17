import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

@Injectable()
export class TelegramTransactionErrorService {
  private readonly logger = new Logger(TelegramTransactionErrorService.name);

  handle(error: unknown): string {
    this.logger.error(
      'Failed to create transaction from Telegram confirmation',
      error instanceof Error ? error.stack : String(error),
    );

    if (error instanceof BadRequestException) {
      return this.handleBadRequest(error);
    }

    if (error instanceof NotFoundException) {
      return this.handleNotFound(error);
    }

    if (error instanceof ConflictException) {
      return 'Status transaksi belum dapat dipastikan karena terjadi konflik. Jangan kirim konfirmasi berulang; periksa daftar transaksi terlebih dahulu.';
    }

    if (error instanceof ForbiddenException) {
      return 'Anda tidak memiliki akses untuk membuat transaksi ini.';
    }

    if (error instanceof ServiceUnavailableException) {
      return 'Layanan sedang tidak tersedia dan status transaksi belum dapat dipastikan. Jangan kirim konfirmasi berulang; periksa daftar transaksi terlebih dahulu.';
    }

    return 'Status transaksi belum dapat dipastikan. Jangan kirim konfirmasi berulang; periksa daftar transaksi terlebih dahulu.';
  }

  private handleNotFound(error: NotFoundException): string {
    const message = this.extractMessage(error);

    switch (message) {
      case 'Account not found':
        return 'Akun keuangan tidak ditemukan. Silakan gunakan akun yang valid.';

      case 'Category not found':
        return 'Kategori tidak ditemukan. Silakan gunakan kategori yang valid.';

      default:
        return 'Data transaksi tidak ditemukan. Silakan periksa kembali akun atau kategori yang digunakan.';
    }
  }

  private handleBadRequest(error: BadRequestException): string {
    const response = error.getResponse();

    if (
      typeof response === 'object' &&
      response !== null &&
      'message' in response
    ) {
      const message = (
        response as {
          message?: unknown;
        }
      ).message;

      if (typeof message === 'string') {
        return this.mapKnownMessage(message);
      }

      if (Array.isArray(message)) {
        return 'Data transaksi tidak valid. Silakan periksa kembali informasi transaksi.';
      }
    }

    return 'Data transaksi tidak valid. Silakan periksa kembali informasi transaksi.';
  }

  private mapKnownMessage(message: string): string {
    switch (message) {
      case 'Account is inactive':
        return 'Akun keuangan yang dipilih sedang tidak aktif. Silakan gunakan akun lain.';

      case 'Account currency must be IDR':
        return 'Akun keuangan harus menggunakan mata uang IDR.';

      case 'Account not found':
        return 'Akun keuangan tidak ditemukan. Silakan gunakan akun yang valid.';

      case 'Category is inactive':
        return 'Kategori yang dipilih sedang tidak aktif. Silakan gunakan kategori lain.';

      case 'Category not found':
        return 'Kategori tidak ditemukan. Silakan gunakan kategori yang valid.';

      case 'Income transaction requires an income category':
        return 'Transaksi pemasukan membutuhkan kategori pemasukan.';

      case 'Expense transaction requires an expense category':
        return 'Transaksi pengeluaran membutuhkan kategori pengeluaran.';

      case 'Transfer transaction cannot have a category':
        return 'Transaksi transfer tidak dapat menggunakan kategori.';

      default:
        return 'Data transaksi tidak valid. Silakan periksa kembali informasi transaksi.';
    }
  }

  private extractMessage(
    error: BadRequestException | NotFoundException,
  ): string | undefined {
    const response = error.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    if (
      typeof response === 'object' &&
      response !== null &&
      'message' in response
    ) {
      const message = (
        response as {
          message?: unknown;
        }
      ).message;

      if (typeof message === 'string') {
        return message;
      }
    }

    return undefined;
  }
}
