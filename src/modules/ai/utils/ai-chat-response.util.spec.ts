import {
  buildAIChatCommunicationInstructions,
  sanitizeAIChatResponse,
} from './ai-chat-response.util';

describe('buildAIChatCommunicationInstructions', () => {
  it('should apply communication rules globally, not only to recommendations', () => {
    const instructions = buildAIChatCommunicationInstructions().join('\n');

    expect(instructions).toContain('UNTUK SELURUH PERCAKAPAN');
    expect(instructions).toContain(
      'Pertanyaan sederhana membutuhkan jawaban singkat',
    );
    expect(instructions).toContain(
      'Jangan menyebut backend, database, server, API',
    );
    expect(instructions).toContain('Jangan gunakan tanda bintang');
  });

  it('should explain recommendation lifecycle terms in user-friendly language', () => {
    const instructions = buildAIChatCommunicationInstructions().join('\n');

    expect(instructions).toContain('PENDING berarti menunggu keputusan');
    expect(instructions).toContain('ACCEPTED berarti telah disetujui');
    expect(instructions).toContain('APPLIED berarti telah diterapkan');
    expect(instructions).toContain('REVIEW berarti perlu ditinjau kembali');
  });
});

describe('sanitizeAIChatResponse', () => {
  it('should remove markdown emphasis and heading syntax without removing the text', () => {
    expect(
      sanitizeAIChatResponse(
        '### Ringkasan\nPengeluaran Food sebesar Rp40.000.',
      ),
    ).toBe('Ringkasan\nPengeluaran Food sebesar Rp40.000.');
  });

  it('should remove raw HTML and decode HTML entities', () => {
    expect(
      sanitizeAIChatResponse('<p>Belum tersedia rekomendasi untuk Food.</p>'),
    ).toBe('Belum tersedia rekomendasi untuk Food.');
  });

  it('should translate internal implementation terms and fields', () => {
    const result = sanitizeAIChatResponse(
      'Data dari backend pada actionCenter memiliki targetMonth 2026-12 dan currentAllocation Rp150.000.',
    );

    expect(result).toContain('sistem');
    expect(result).toContain('daftar rekomendasi yang perlu ditindaklanjuti');
    expect(result).toContain('bulan anggaran 2026-12');
    expect(result).toContain('anggaran saat ini Rp150.000');

    expect(result).not.toMatch(
      /backend|actionCenter|targetMonth|currentAllocation/i,
    );
  });

  it('should translate lifecycle statuses and recommendation actions', () => {
    expect(
      sanitizeAIChatResponse(
        'Status: PENDING. Action: REVIEW. Setelah ACCEPTED, rekomendasi belum APPLIED.',
      ),
    ).toBe(
      'Status: menunggu keputusan. Tindakan: perlu ditinjau kembali. Setelah disetujui, rekomendasi belum diterapkan.',
    );
  });

  it('should keep ordinary financial facts and monetary values unchanged', () => {
    expect(
      sanitizeAIChatResponse(
        'Pengeluaran Food sebesar Rp1.500.000 dan sisa anggaran Rp250.000.',
      ),
    ).toBe('Pengeluaran Food sebesar Rp1.500.000 dan sisa anggaran Rp250.000.');
  });

  it('should return an empty string for empty provider content', () => {
    expect(sanitizeAIChatResponse('   ')).toBe('');
  });
});
