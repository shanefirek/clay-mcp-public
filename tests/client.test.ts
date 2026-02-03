/**
 * Clay Client Tests
 *
 * Unit tests with mocked API responses.
 * These tests do NOT hit the real API.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock environment
vi.stubEnv('CLAY_SESSION_COOKIE', 'test_cookie');

describe('ClayClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('getTable', () => {
    it('should fetch table schema', async () => {
      const mockTable = {
        id: 't_test123',
        name: 'Test Table',
        fields: [
          { id: 'f_name', name: 'Name', type: 'text' },
          { id: 'f_email', name: 'Email', type: 'email' },
        ],
        views: [{ id: 'gv_default', name: 'Default View' }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockTable)),
      });

      // Dynamic import to get fresh module with mocked env
      const { ClayClient } = await import('../src/client.js');
      const client = new ClayClient({ sessionCookie: 'test_cookie' });

      const result = await client.getTable('t_test123' as `t_${string}`);

      expect(result).toEqual(mockTable);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.clay.com/v3/tables/t_test123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'application/json',
            Cookie: 'claysession=test_cookie',
          }),
        })
      );
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Table not found'),
      });

      const { ClayClient } = await import('../src/client.js');
      const client = new ClayClient({ sessionCookie: 'test_cookie' });

      await expect(
        client.getTable('t_invalid' as `t_${string}`)
      ).rejects.toThrow('Clay API error: 404');
    });
  });

  describe('createRecord', () => {
    it('should create a new record', async () => {
      const mockRecord = {
        id: 'r_new123',
        tableId: 't_test123',
        cells: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockRecord)),
      });

      const { ClayClient } = await import('../src/client.js');
      const client = new ClayClient({ sessionCookie: 'test_cookie' });

      const result = await client.createRecord('t_test123' as `t_${string}`);

      expect(result.tableId).toBe('t_test123');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/tables\/t_test123\/records\/r_/),
        expect.objectContaining({
          method: 'POST',
          body: '{}',
        })
      );
    });
  });

  describe('updateRecord', () => {
    it('should update a record', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(JSON.stringify({ message: 'Record updates enqueued' })),
      });

      const { ClayClient } = await import('../src/client.js');
      const client = new ClayClient({ sessionCookie: 'test_cookie' });

      const result = await client.updateRecord(
        't_test123' as `t_${string}`,
        'r_record1' as `r_${string}`,
        { f_name: 'Updated Name' }
      );

      expect(result.message).toBe('Record updates enqueued');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.clay.com/v3/tables/t_test123/records/r_record1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ f_name: 'Updated Name' }),
        })
      );
    });
  });

  describe('deleteRecords', () => {
    it('should delete records', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(''),
      });

      const { ClayClient } = await import('../src/client.js');
      const client = new ClayClient({ sessionCookie: 'test_cookie' });

      await client.deleteRecords('t_test123' as `t_${string}`, [
        'r_record1' as `r_${string}`,
        'r_record2' as `r_${string}`,
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.clay.com/v3/tables/t_test123/records',
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({ recordIds: ['r_record1', 'r_record2'] }),
        })
      );
    });
  });

  describe('runEnrichment', () => {
    it('should trigger enrichment', async () => {
      const mockResponse = {
        recordCount: 2,
        runMode: 'INDIVIDUAL',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      });

      const { ClayClient } = await import('../src/client.js');
      const client = new ClayClient({ sessionCookie: 'test_cookie' });

      const result = await client.runEnrichment(
        't_test123' as `t_${string}`,
        ['f_enrichment1' as `f_${string}`],
        ['r_record1' as `r_${string}`, 'r_record2' as `r_${string}`],
        true
      );

      expect(result.recordCount).toBe(2);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.clay.com/v3/tables/t_test123/run',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"forceRun":true'),
        })
      );
    });
  });

  describe('dry run mode', () => {
    it('should not make actual requests in dry run mode', async () => {
      const { ClayClient } = await import('../src/client.js');
      const client = new ClayClient({
        sessionCookie: 'test_cookie',
        dryRun: true,
      });

      const result = await client.getTable('t_test123' as `t_${string}`);

      expect(result).toEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
