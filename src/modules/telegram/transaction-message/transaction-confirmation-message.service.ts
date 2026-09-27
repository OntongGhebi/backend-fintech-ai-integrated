import { Injectable } from '@nestjs/common';

import { PendingTransactionConfirmation } from './transaction-confirmation.types';

@Injectable()
export class TransactionConfirmationMessageService {
  format(confirmation: PendingTransactionConfirmation): string {
    const { intent } = confirmation;

    const transactionType =
      intent.transactionType === 'INCOME' ? '💰 Pemasukan' : '💸 Pengeluaran';

    const amount = this.formatAmount(intent.amount ?? 0);

    const account = intent.accountId
      ? `🏦 Account ID: ${intent.accountId}`
      : '🏦 Account belum ditentukan';

    const category = intent.categoryId
      ? `📂 Category ID: ${intent.categoryId}`
      : undefined;

    const lines = [
      '🔎 Konfirmasi transaksi',
      '',
      transactionType,
      `💵 ${amount}`,
      `📝 ${intent.description ?? '-'}`,
      account,
    ];

    if (category) {
      lines.push(category);
    }

    lines.push(
      '',
      'Apakah transaksi ini benar?',
      '',
      'Balas YA untuk menyimpan.',
      'Balas BATAL untuk membatalkan.',
    );

    return lines.join('\n');
  }

  formatConfirmed(): string {
    return ['✅ Transaksi dikonfirmasi.', '', 'Transaksi akan diproses.'].join(
      '\n',
    );
  }

  formatCancelled(): string {
    return [
      '❌ Transaksi dibatalkan.',
      '',
      'Tidak ada transaksi yang dibuat.',
    ].join('\n');
  }

  formatExpired(): string {
    return [
      '⌛ Konfirmasi transaksi sudah kedaluwarsa.',
      '',
      'Silakan kirim kembali transaksi yang ingin dicatat.',
    ].join('\n');
  }

  formatNoPendingConfirmation(): string {
    return 'ℹ️ Tidak ada transaksi yang sedang menunggu konfirmasi.';
  }

  formatUnknownAction(): string {
    return [
      'Saya belum memahami jawaban tersebut.',
      '',
      'Balas YA untuk menyimpan transaksi.',
      'Balas BATAL untuk membatalkan.',
    ].join('\n');
  }

  formatAlreadyProcessed(): string {
    return [
      'ℹ️ Transaksi ini sudah diproses.',
      '',
      'Tidak ada transaksi baru yang dibuat.',
    ].join('\n');
  }

  formatProcessing(): string {
    return [
      '⏳ Transaksi sedang diproses.',
      '',
      'Silakan tunggu sebentar.',
    ].join('\n');
  }

  formatTransactionCreated(transaction: {
    id: string;
    type: string;
    amount: number;
    description?: string | null;
  }): string {
    const type =
      transaction.type === 'INCOME' ? '💰 Pemasukan' : '💸 Pengeluaran';

    const amount = this.formatAmount(transaction.amount);

    return [
      '✅ Transaksi berhasil dibuat.',
      '',
      type,
      `💵 ${amount}`,
      `📝 ${transaction.description ?? '-'}`,
    ].join('\n');
  }

  private formatAmount(amount: number): string {
    const formatted = new Intl.NumberFormat('id-ID', {
      maximumFractionDigits: 0,
    }).format(amount);

    return `Rp${formatted}`;
  }
}
