export interface AIFinancialContextPromptInput {
  currency: string;
  summary: {
    income: string;
    expense: string;
    balance: string;
    incomeCount: number;
    expenseCount: number;
  };
  expensesByCategory: Array<{
    category: string;
    amount: string;
  }>;
  recentTransactions: Array<{
    id: string;
    type: string;
    amount: string;
    currency: string;
    description: string | null;
    transactionDate: Date | string;
    category: string | null;
    account: string | null;
  }>;
  budgets: Array<{
    id: string;
    name: string;
    currency: string;
    limit: string;
    spent: string;
    remaining: string;
    usagePercentage: number;
    period: string;
    periodStart: Date;
    startDate: Date;
    endDate: Date;
  }>;
}

/**
 * Formats a decimal monetary string without converting it to JavaScript
 * floating-point numbers. This avoids precision loss for large amounts.
 *
 * Examples:
 * - IDR "40000.00"  -> "Rp40.000"
 * - IDR "400000.00" -> "Rp400.000"
 * - IDR "1500000.00" -> "Rp1.500.000"
 */
export function formatFinancialAmount(
  amount: string,
  currency: string,
): string {
  const normalized = amount.trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);

  if (!match) {
    return `${currency} ${normalized}`;
  }

  const sign = match[1] === '-' ? '-' : '';
  const whole = BigInt(match[2]);
  const fraction = (match[3] ?? '').padEnd(2, '0');

  const formattedWhole = new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 0,
  }).format(whole);

  if (currency.toUpperCase() === 'IDR') {
    const decimalPart = fraction === '00' ? '' : `,${fraction}`;

    return `${sign}Rp${formattedWhole}${decimalPart}`;
  }

  const decimalPart = fraction === '00' ? '' : `.${fraction}`;

  return `${sign}${currency} ${formattedWhole}${decimalPart}`;
}

/**
 * Builds an authoritative financial context for the AI model.
 *
 * Raw financial values remain available in the original JSON. A second,
 * compact representation provides human-readable monetary values so the
 * model does not need to infer Indonesian number formatting.
 */
export function buildAIFinancialContextPrompt(
  context: AIFinancialContextPromptInput,
): string {
  const canonicalFacts = {
    currency: context.currency,

    budgets: context.budgets.map((budget) => ({
      id: budget.id,
      name: budget.name,
      currency: budget.currency,

      limit: budget.limit,
      limitDisplay: formatFinancialAmount(budget.limit, budget.currency),

      spent: budget.spent,
      spentDisplay: formatFinancialAmount(budget.spent, budget.currency),

      remaining: budget.remaining,
      remainingDisplay: formatFinancialAmount(
        budget.remaining,
        budget.currency,
      ),

      usagePercentage: budget.usagePercentage,
      period: budget.period,
      periodStart: budget.periodStart,
      startDate: budget.startDate,
      endDate: budget.endDate,
    })),

    recentTransactions: context.recentTransactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,

      amount: transaction.amount,
      amountDisplay: formatFinancialAmount(
        transaction.amount,
        transaction.currency,
      ),

      currency: transaction.currency,
      description: transaction.description,
      transactionDate: transaction.transactionDate,
      category: transaction.category,
      account: transaction.account,
    })),

    expensesByCategory: context.expensesByCategory.map((item) => ({
      category: item.category,
      amount: item.amount,
      amountDisplay: formatFinancialAmount(item.amount, context.currency),
    })),
  };

  return [
    'ATURAN AKURASI DATA KEUANGAN:',
    '- Semua nominal pada JSON menggunakan satuan mata uang utama, bukan satuan minor atau sen.',
    '- Untuk IDR, angka "40000.00" berarti Rp40.000, bukan Rp400.000.',
    '- Untuk IDR, angka "400000.00" berarti Rp400.000.',
    '- Jangan menambahkan atau menghilangkan angka nol dari nominal yang diberikan backend.',
    '- Jangan mengalikan atau membagi nominal dengan 10, 100, 1.000, atau faktor lainnya.',
    '- Salin nominal transaksi dari recentTransactions.amount atau amountDisplay secara persis.',
    '- Untuk analisis budget, gunakan budgets.limit, budgets.spent, dan budgets.remaining sebagai sumber kebenaran.',
    '- Nilai usagePercentage pada data budget sudah dihitung backend. Jangan menghitung ulang atau mengubahnya.',
    '- Jangan menyimpulkan nominal pengeluaran budget dari nominal transaksi lain yang tidak sesuai kategori atau periode.',
    '- Jangan menggunakan Budget.amount lama. Alokasi bulanan yang diberikan backend adalah sumber nominal budget.',
    '- Jika suatu data tidak tersedia, katakan bahwa data tersebut tidak tersedia. Jangan mengarang nilai pengganti.',
    '',
    'CONTOH INTERPRETASI NOMINAL IDR:',
    '- "40000.00" = Rp40.000 (empat puluh ribu rupiah).',
    '- "400000.00" = Rp400.000 (empat ratus ribu rupiah).',
    '- "1500000.00" = Rp1.500.000 (satu juta lima ratus ribu rupiah).',
    '',
    'KONTEKS KEUANGAN PENGGUNA (JSON):',
    JSON.stringify(context),
    '',
    'FAKTA KEUANGAN DENGAN FORMAT NOMINAL YANG SUDAH DIFORMAT BACKEND (JSON):',
    JSON.stringify(canonicalFacts),
    '',
    'PRIORITAS:',
    '- Jika terdapat perbedaan interpretasi angka, nilai numerik dan tampilan nominal pada konteks backend adalah acuan.',
    '- Saat menjawab pertanyaan budget, tampilkan alokasi, pengeluaran, sisa budget, dan persentase penggunaan dari data budget yang tersedia.',
    '- Jangan mengganti nilai faktual dengan perkiraan atau hasil perhitungan model.',
  ].join('\n');
}
