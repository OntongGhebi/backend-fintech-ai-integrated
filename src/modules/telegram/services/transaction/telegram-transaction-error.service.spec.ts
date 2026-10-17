import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { TelegramTransactionErrorService } from './telegram-transaction-error.service';

describe('TelegramTransactionErrorService', () => {
  let service: TelegramTransactionErrorService;

  beforeEach(() => {
    service = new TelegramTransactionErrorService();
  });

  it('should map account inactive error', () => {
    const error = new BadRequestException('Account is inactive');

    expect(service.handle(error)).toBe(
      'Akun keuangan yang dipilih sedang tidak aktif. Silakan gunakan akun lain.',
    );
  });

  it('should map account currency error', () => {
    const error = new BadRequestException('Account currency must be IDR');

    expect(service.handle(error)).toBe(
      'Akun keuangan harus menggunakan mata uang IDR.',
    );
  });

  it('should map category inactive error', () => {
    const error = new BadRequestException('Category is inactive');

    expect(service.handle(error)).toBe(
      'Kategori yang dipilih sedang tidak aktif. Silakan gunakan kategori lain.',
    );
  });

  it('should map category not found error', () => {
    const error = new NotFoundException('Category not found');

    expect(service.handle(error)).toBe(
      'Kategori tidak ditemukan. Silakan gunakan kategori yang valid.',
    );
  });

  it('should map income category mismatch', () => {
    const error = new BadRequestException(
      'Income transaction requires an income category',
    );

    expect(service.handle(error)).toBe(
      'Transaksi pemasukan membutuhkan kategori pemasukan.',
    );
  });

  it('should map expense category mismatch', () => {
    const error = new BadRequestException(
      'Expense transaction requires an expense category',
    );

    expect(service.handle(error)).toBe(
      'Transaksi pengeluaran membutuhkan kategori pengeluaran.',
    );
  });

  it('should map transfer category error', () => {
    const error = new BadRequestException(
      'Transfer transaction cannot have a category',
    );

    expect(service.handle(error)).toBe(
      'Transaksi transfer tidak dapat menggunakan kategori.',
    );
  });

  it('should map generic not found error', () => {
    const error = new NotFoundException('Transaction not found');

    expect(service.handle(error)).toBe(
      'Data transaksi tidak ditemukan. Silakan periksa kembali akun atau kategori yang digunakan.',
    );
  });

  it('should map conflict error', () => {
    const error = new ConflictException();

    expect(service.handle(error)).toBe(
      'Status transaksi belum dapat dipastikan karena terjadi konflik. Jangan kirim konfirmasi berulang; periksa daftar transaksi terlebih dahulu.',
    );
  });

  it('should map forbidden error', () => {
    const error = new ForbiddenException();

    expect(service.handle(error)).toBe(
      'Anda tidak memiliki akses untuk membuat transaksi ini.',
    );
  });

  it('should map service unavailable error', () => {
    const error = new ServiceUnavailableException();

    expect(service.handle(error)).toBe(
      'Layanan sedang tidak tersedia dan status transaksi belum dapat dipastikan. Jangan kirim konfirmasi berulang; periksa daftar transaksi terlebih dahulu.',
    );
  });

  it('should hide unknown internal errors', () => {
    const error = new Error(
      'PrismaClientKnownRequestError: unique constraint failed',
    );

    expect(service.handle(error)).toBe(
      'Status transaksi belum dapat dipastikan. Jangan kirim konfirmasi berulang; periksa daftar transaksi terlebih dahulu.',
    );
  });

  it('should hide non-error thrown values', () => {
    expect(service.handle('database failure')).toBe(
      'Status transaksi belum dapat dipastikan. Jangan kirim konfirmasi berulang; periksa daftar transaksi terlebih dahulu.',
    );
  });

  it('should handle validation message arrays safely', () => {
    const error = new BadRequestException({
      message: [
        'amount must be a positive number',
        'description must be a string',
      ],
    });

    expect(service.handle(error)).toBe(
      'Data transaksi tidak valid. Silakan periksa kembali informasi transaksi.',
    );
  });
});
