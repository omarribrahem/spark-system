import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  GDriveOAuthService,
  generateRandomString,
  generateCodeChallenge,
  GDRIVE_SCOPE,
} from '../../../src/services/gdrive-oauth-service';

describe('GDriveOAuthService: RFC 8252 Desktop OAuth & Security Invariants', () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    vi.restoreAllMocks();
    GDriveOAuthService.setCredentials('test-client-id.apps.googleusercontent.com', 'test-client-secret');
    await GDriveOAuthService.disconnect();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. PKCE & Security State Verification', () => {
    it('generates cryptographically secure random verifier and state strings', () => {
      const s1 = generateRandomString(32);
      const s2 = generateRandomString(32);
      expect(s1).toHaveLength(32);
      expect(s2).toHaveLength(32);
      expect(s1).not.toBe(s2);
    });

    it('generates valid SHA-256 base64url code challenge without padding', async () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = await generateCodeChallenge(verifier);
      expect(challenge).toBeDefined();
      expect(challenge).not.toContain('=');
      expect(challenge).not.toContain('+');
      expect(challenge).not.toContain('/');
    });

    it('constructs Google OAuth authorization URL with minimal drive.file scope and PKCE params', async () => {
      const session = await GDriveOAuthService.createPKCESession({ port: 8547 });
      const url = new URL(session.authUrl);

      expect(url.origin).toBe('https://accounts.google.com');
      expect(url.pathname).toBe('/o/oauth2/v2/auth');
      expect(url.searchParams.get('client_id')).toBe('test-client-id.apps.googleusercontent.com');
      expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:8547/oauth/callback');
      expect(url.searchParams.get('scope')).toContain(GDRIVE_SCOPE);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('state')).toBe(session.state);
      expect(url.searchParams.get('access_type')).toBe('offline');
    });

    it('rejects exchange if returned state does not match expected state (CSRF protection)', async () => {
      await expect(
        GDriveOAuthService.exchangeCodeForTokens(
          'auth-code-123',
          'attacker-state',
          'legitimate-state',
          'verifier-xyz',
          'http://127.0.0.1:8547/oauth/callback'
        )
      ).rejects.toThrow(/عدم تطابق رمز State/);
    });
  });

  describe('2. Connect, Authenticate & User Email Verification', () => {
    it('exchanges authorization code, retrieves authentic email, and updates status', async () => {
      const fakeTokenResponse = {
        access_token: 'fake-access-token-123',
        refresh_token: 'fake-refresh-token-456',
        expires_in: 3600,
        token_type: 'Bearer',
      };

      const fakeUserInfo = {
        email: 'owner@spark-internal.com',
        verified_email: true,
      };

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/token')) {
          return Promise.resolve(new Response(JSON.stringify(fakeTokenResponse), { status: 200 }));
        }
        if (url.includes('/userinfo')) {
          return Promise.resolve(new Response(JSON.stringify(fakeUserInfo), { status: 200 }));
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const status = await GDriveOAuthService.exchangeCodeForTokens(
        'valid-code',
        'my-state',
        'my-state',
        'my-verifier',
        'http://127.0.0.1:8547/oauth/callback'
      );

      expect(status.connected).toBe(true);
      expect(status.email).toBe('owner@spark-internal.com');
      expect(status.folderName).toBe('Spark Internal Backups');
    });

    it('never exposes hard-coded developer emails in status when disconnected', async () => {
      await GDriveOAuthService.disconnect();
      const status = await GDriveOAuthService.getStatus();
      expect(status.connected).toBe(false);
      expect(status.email).toBeNull();
    });
  });

  describe('3. Token Refresh on Expiry & Revocation Handling', () => {
    it('automatically refreshes access token using stored refresh token when expired', async () => {
      // First, simulate connected state
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/token')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: 'initial-access-token',
                refresh_token: 'stored-refresh-token',
                expires_in: 0, // Immediately expired
              }),
              { status: 200 }
            )
          );
        }
        if (url.includes('/userinfo')) {
          return Promise.resolve(new Response(JSON.stringify({ email: 'test@spark.com' }), { status: 200 }));
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      });

      await GDriveOAuthService.exchangeCodeForTokens('c', 's', 's', 'v', 'r');

      // Now mock the refresh endpoint returning new token
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/token')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: 'fresh-refreshed-token-999',
                expires_in: 3600,
              }),
              { status: 200 }
            )
          );
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      });

      const validToken = await GDriveOAuthService.getValidAccessToken();
      expect(validToken).toBe('fresh-refreshed-token-999');
    });

    it('handles revoked token by auto-disconnecting and notifying user', async () => {
      // Simulate connected state
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/token')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: 'initial-token',
                refresh_token: 'some-refresh-token',
                expires_in: 0,
              }),
              { status: 200 }
            )
          );
        }
        if (url.includes('/userinfo')) {
          return Promise.resolve(new Response(JSON.stringify({ email: 'test@spark.com' }), { status: 200 }));
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      });

      await GDriveOAuthService.exchangeCodeForTokens('c', 's', 's', 'v', 'r');

      // Now simulate Google rejecting with invalid_grant (revoked)
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/token')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: 'invalid_grant',
                error_description: 'Token has been expired or revoked.',
              }),
              { status: 400 }
            )
          );
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      });

      await expect(GDriveOAuthService.getValidAccessToken()).rejects.toThrow(/تم إلغاء صلاحية الوصول/);

      const status = await GDriveOAuthService.getStatus();
      expect(status.connected).toBe(false);
      expect(status.email).toBeNull();
    });
  });

  describe('4. Change Account: Old Backups Preservation & Local Credential Purge', () => {
    it('purges local credentials on changeAccount without deleting remote backups', async () => {
      // Connect account 1
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/token')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: 'acc1-token',
                refresh_token: 'acc1-refresh',
                expires_in: 3600,
              }),
              { status: 200 }
            )
          );
        }
        if (url.includes('/userinfo')) {
          return Promise.resolve(new Response(JSON.stringify({ email: 'old-account@gmail.com' }), { status: 200 }));
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      });

      await GDriveOAuthService.exchangeCodeForTokens('c1', 's', 's', 'v', 'r');
      expect((await GDriveOAuthService.getStatus()).email).toBe('old-account@gmail.com');

      // Trigger change account session
      const newSession = await GDriveOAuthService.prepareChangeAccount(8547);
      const url = new URL(newSession.authUrl);

      // Verify Google Account Chooser is forced
      expect(url.searchParams.get('prompt')).toBe('select_account');

      // Verify local status is cleared (no longer connected to old account)
      const postStatus = await GDriveOAuthService.getStatus();
      expect(postStatus.connected).toBe(false);
      expect(postStatus.email).toBeNull();
    });
  });

  describe('5. Upload, Quota & Network Resilience', () => {
    it('uploads backup bundle successfully to dedicated folder and returns file metadata', async () => {
      // Mock active session
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/token')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ access_token: 'valid-tok', refresh_token: 'ref-tok', expires_in: 3600 }),
              { status: 200 }
            )
          );
        }
        if (url.includes('/userinfo')) {
          return Promise.resolve(new Response(JSON.stringify({ email: 'user@spark.com' }), { status: 200 }));
        }
        // Folder query
        if (url.includes('/files?q=')) {
          return Promise.resolve(
            new Response(JSON.stringify({ files: [{ id: 'folder-spark-123', name: 'Spark Internal Backups' }] }), {
              status: 200,
            })
          );
        }
        // Upload
        if (url.includes('/upload/drive/v3/files')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ id: 'gdrive-file-999', name: 'spark-backup.json', size: '1024' }),
              { status: 200 }
            )
          );
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      });

      await GDriveOAuthService.exchangeCodeForTokens('c', 's', 's', 'v', 'r');

      const result = await GDriveOAuthService.uploadBackup('{"mock":"data"}', 'spark-backup.json');
      expect(result.fileId).toBe('gdrive-file-999');
      expect(result.name).toBe('spark-backup.json');
      expect(result.sizeBytes).toBe(1024);

      const status = await GDriveOAuthService.getStatus();
      expect(status.lastUploadAt).toBeDefined();
      expect(status.lastError).toBeNull();
    });

    it('records error in status and preserves caller state when Google Drive upload fails (e.g. Quota Exceeded)', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/token')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ access_token: 'valid-tok', refresh_token: 'ref-tok', expires_in: 3600 }),
              { status: 200 }
            )
          );
        }
        if (url.includes('/userinfo')) {
          return Promise.resolve(new Response(JSON.stringify({ email: 'user@spark.com' }), { status: 200 }));
        }
        if (url.includes('/files?q=')) {
          return Promise.resolve(
            new Response(JSON.stringify({ files: [{ id: 'fld-1', name: 'Spark Internal Backups' }] }), {
              status: 200,
            })
          );
        }
        if (url.includes('/upload/drive/v3/files')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: {
                  message: 'The user storage quota has been exceeded.',
                  code: 403,
                },
              }),
              { status: 403 }
            )
          );
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      });

      await GDriveOAuthService.exchangeCodeForTokens('c', 's', 's', 'v', 'r');

      await expect(
        GDriveOAuthService.uploadBackup('{"mock":"data"}', 'spark-backup.json')
      ).rejects.toThrow(/quota has been exceeded/);

      const status = await GDriveOAuthService.getStatus();
      expect(status.lastError).toContain('quota has been exceeded');
    });

    it('handles network disconnection gracefully', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/token')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ access_token: 'valid-tok', refresh_token: 'ref-tok', expires_in: 3600 }),
              { status: 200 }
            )
          );
        }
        if (url.includes('/userinfo')) {
          return Promise.resolve(new Response(JSON.stringify({ email: 'user@spark.com' }), { status: 200 }));
        }
        // Network offline
        return Promise.reject(new Error('Failed to fetch (Network disconnected)'));
      });

      await GDriveOAuthService.exchangeCodeForTokens('c', 's', 's', 'v', 'r');

      await expect(
        GDriveOAuthService.uploadBackup('{"mock":"data"}', 'spark-backup.json')
      ).rejects.toThrow(/Network disconnected/);

      const status = await GDriveOAuthService.getStatus();
      expect(status.lastError).toContain('Network disconnected');
    });
  });

  describe('6. Remote Listing & Download for Restore', () => {
    it('lists and downloads remote backup bundles from dedicated folder', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/token')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ access_token: 'valid-tok', refresh_token: 'ref-tok', expires_in: 3600 }),
              { status: 200 }
            )
          );
        }
        if (url.includes('/userinfo')) {
          return Promise.resolve(new Response(JSON.stringify({ email: 'user@spark.com' }), { status: 200 }));
        }
        if (url.includes('/files?') && url.includes('orderBy=createdTime')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                files: [
                  { id: 'f1', name: 'spark-backup-2026-09-08.json', createdTime: '2026-09-08T10:00:00Z', size: '2048' },
                ],
              }),
              { status: 200 }
            )
          );
        }
        if (url.includes('/files?q=')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                files: [{ id: 'fld-1', name: 'Spark Internal Backups' }],
              }),
              { status: 200 }
            )
          );
        }
        if (url.includes('/files/f1?alt=media')) {
          return Promise.resolve(new Response('{"manifest":{},"tables":{}}', { status: 200 }));
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      });

      await GDriveOAuthService.exchangeCodeForTokens('c', 's', 's', 'v', 'r');

      const files = await GDriveOAuthService.listRemoteBackups();
      expect(files).toHaveLength(1);
      expect(files[0].id).toBe('f1');
      expect(files[0].sizeBytes).toBe(2048);

      const downloaded = await GDriveOAuthService.downloadRemoteBackup('f1');
      expect(downloaded).toContain('"manifest"');
    });
  });
});
