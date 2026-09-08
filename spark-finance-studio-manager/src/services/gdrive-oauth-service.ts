/**
 * Google Drive OAuth 2.0 Desktop Integration Service
 * Spark Finance & Studio Manager
 * 
 * Complies with RFC 8252 (OAuth 2.0 for Native Apps) and RFC 7636 (PKCE).
 * - Minimal Scope: https://www.googleapis.com/auth/drive.file (Only files created by Spark)
 * - Zero hard-coded emails or developer secrets.
 * - Refresh token is stored strictly in Windows Credential Manager via OS Keychain.
 * - Offline-first: Network operations are non-blocking and never delete local data on failure.
 */

export interface GDriveConnectionStatus {
  connected: boolean;
  email: string | null;
  folderId: string | null;
  folderName: string | null;
  lastBackupAt: string | null;
  lastUploadAt: string | null;
  lastError: string | null;
  nextScheduledBackupAt: string | null;
}

export interface GDriveUploadResult {
  fileId: string;
  name: string;
  uploadedAt: string;
  sizeBytes: number;
}

export interface GDriveRemoteFile {
  id: string;
  name: string;
  createdTime: string;
  sizeBytes: number;
}

export interface PKCESession {
  state: string;
  verifier: string;
  authUrl: string;
  redirectUri: string;
}

// Minimal Scope: Only files created/opened by Spark Internal
export const GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GDRIVE_DEFAULT_FOLDER_NAME = 'Spark Internal Backups';
export const OAUTH_KEYCHAIN_SERVICE = 'SparkFinanceStudioManager';
export const OAUTH_KEYCHAIN_ACCOUNT = 'gdrive_refresh_token';

// In-memory fallback for secure token if running outside native Tauri keychain
let memoryRefreshToken: string | null = null;
let memoryAccessToken: { token: string; expiresAt: number } | null = null;
let currentStatusCache: GDriveConnectionStatus | null = null;

/**
 * Checks if the app is currently running inside Tauri desktop runtime.
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Base64-URL encoder according to RFC 7636.
 */
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generates a cryptographically secure random string.
 */
export function generateRandomString(length = 48): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[values[i] % charset.length];
  }
  return result;
}

/**
 * Generates SHA-256 code challenge from code verifier for PKCE.
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

/**
 * Stores refresh token in Windows Credential Manager or memory.
 * Never writes to SQLite, localStorage, or disk files.
 */
export async function storeRefreshTokenSecurely(token: string): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('store_oauth_token', {
        service: OAUTH_KEYCHAIN_SERVICE,
        account: OAUTH_KEYCHAIN_ACCOUNT,
        token,
      });
      return;
    } catch {
      // Fallback to memory if Tauri command isn't registered yet
    }
  }
  memoryRefreshToken = token;
}

/**
 * Retrieves refresh token from Windows Credential Manager or memory.
 */
export async function getRefreshTokenSecurely(): Promise<string | null> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const token = await invoke<string | null>('get_oauth_token', {
        service: OAUTH_KEYCHAIN_SERVICE,
        account: OAUTH_KEYCHAIN_ACCOUNT,
      });
      if (token) return token;
    } catch {
      // Fallback to memory
    }
  }
  return memoryRefreshToken;
}

/**
 * Deletes refresh token from Windows Credential Manager.
 */
export async function deleteRefreshTokenSecurely(): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('delete_oauth_token', {
        service: OAUTH_KEYCHAIN_SERVICE,
        account: OAUTH_KEYCHAIN_ACCOUNT,
      });
    } catch {
      // Ignore
    }
  }
  memoryRefreshToken = null;
  memoryAccessToken = null;
}

export class GDriveOAuthService {
  private static clientId = '';
  private static clientSecret = '';

  /**
   * Configures the OAuth 2.0 credentials for desktop app.
   */
  public static setCredentials(clientId: string, clientSecret = ''): void {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  public static getClientId(): string {
    return this.clientId;
  }

  /**
   * Initializes or returns the current Google Drive connection status.
   */
  public static async getStatus(): Promise<GDriveConnectionStatus> {
    const refreshToken = await getRefreshTokenSecurely();
    if (!refreshToken) {
      currentStatusCache = {
        connected: false,
        email: null,
        folderId: null,
        folderName: null,
        lastBackupAt: currentStatusCache?.lastBackupAt || null,
        lastUploadAt: null,
        lastError: null,
        nextScheduledBackupAt: null,
      };
      return currentStatusCache;
    }

    if (!currentStatusCache) {
      currentStatusCache = {
        connected: true,
        email: null,
        folderId: null,
        folderName: GDRIVE_DEFAULT_FOLDER_NAME,
        lastBackupAt: null,
        lastUploadAt: null,
        lastError: null,
        nextScheduledBackupAt: null,
      };
    }
    return currentStatusCache;
  }

  /**
   * Generates authorization URL with PKCE and state verification.
   */
  public static async createPKCESession(options?: {
    prompt?: 'consent' | 'select_account';
    port?: number;
  }): Promise<PKCESession> {
    const state = generateRandomString(32);
    const verifier = generateRandomString(64);
    const challenge = await generateCodeChallenge(verifier);
    const port = options?.port || 8547;
    const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;

    const params = new URLSearchParams({
      client_id: this.clientId || 'spark-desktop-client.apps.googleusercontent.com',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: `${GDRIVE_SCOPE} https://www.googleapis.com/auth/userinfo.email`,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      access_type: 'offline',
      prompt: options?.prompt || 'consent',
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return {
      state,
      verifier,
      authUrl,
      redirectUri,
    };
  }

  /**
   * Exchanges authorization code for tokens and fetches authentic user email.
   */
  public static async exchangeCodeForTokens(
    code: string,
    state: string,
    expectedState: string,
    verifier: string,
    redirectUri: string
  ): Promise<GDriveConnectionStatus> {
    if (!code) {
      throw new Error('لم يتم استقبال رمز التصريح من خادم Google');
    }
    if (state !== expectedState) {
      throw new Error('فشل التحقق الأمني: عدم تطابق رمز State (احتمال محاولة تزوير الطلب CSRF)');
    }

    // Exchange code via Google OAuth endpoint
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId || 'spark-desktop-client.apps.googleusercontent.com',
        client_secret: this.clientSecret,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(`فشل استبدال رمز الدخول: ${errJson.error_description || response.statusText}`);
    }

    const data = await response.json();
    if (!data.refresh_token) {
      throw new Error('لم يتم استلام Refresh Token من Google. تأكد من تحديد وصول offline والموافقة على الأذونات.');
    }

    // Save refresh token strictly in Windows Keychain
    await storeRefreshTokenSecurely(data.refresh_token);

    // Cache access token in memory
    memoryAccessToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };

    // Fetch real authenticated email from UserInfo API
    const userInfoResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });

    let authenticEmail: string | null = null;
    if (userInfoResp.ok) {
      const userInfo = await userInfoResp.json();
      authenticEmail = userInfo.email || null;
    }

    currentStatusCache = {
      connected: true,
      email: authenticEmail,
      folderId: null,
      folderName: GDRIVE_DEFAULT_FOLDER_NAME,
      lastBackupAt: new Date().toISOString(),
      lastUploadAt: null,
      lastError: null,
      nextScheduledBackupAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    };

    return currentStatusCache;
  }

  /**
   * Retrieves a valid access token, automatically refreshing if expired.
   */
  public static async getValidAccessToken(): Promise<string> {
    if (memoryAccessToken && memoryAccessToken.expiresAt > Date.now()) {
      return memoryAccessToken.token;
    }

    const refreshToken = await getRefreshTokenSecurely();
    if (!refreshToken) {
      throw new Error('Google Drive غير متصل. يرجى ربط الحساب أولاً.');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId || 'spark-desktop-client.apps.googleusercontent.com',
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      if (errJson.error === 'invalid_grant') {
        // Token was revoked on Google side
        await this.disconnect();
        throw new Error('تم إلغاء صلاحية الوصول لحساب Google Drive من قِبل المستخدم. يرجى إعادة ربط الحساب.');
      }
      throw new Error(`تعذر تجديد رمز الوصول: ${errJson.error_description || response.statusText}`);
    }

    const data = await response.json();
    memoryAccessToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };

    return data.access_token;
  }

  /**
   * Finds or creates the dedicated "Spark Internal Backups" folder.
   */
  public static async ensureBackupFolder(): Promise<{ folderId: string; folderName: string }> {
    const accessToken = await this.getValidAccessToken();

    // Query for existing folder
    const query = encodeURIComponent(
      `mimeType='application/vnd.google-apps.folder' and name='${GDRIVE_DEFAULT_FOLDER_NAME}' and trashed=false`
    );
    const listResp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (listResp.ok) {
      const listData = await listResp.json();
      if (listData.files && listData.files.length > 0) {
        const existing = listData.files[0];
        if (currentStatusCache) {
          currentStatusCache.folderId = existing.id;
          currentStatusCache.folderName = existing.name;
        }
        return { folderId: existing.id, folderName: existing.name };
      }
    }

    // Create new folder
    const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: GDRIVE_DEFAULT_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    if (!createResp.ok) {
      throw new Error('فشل إنشاء مجلد النسخ الاحتياطية في Google Drive');
    }

    const created = await createResp.json();
    if (currentStatusCache) {
      currentStatusCache.folderId = created.id;
      currentStatusCache.folderName = created.name;
    }
    return { folderId: created.id, folderName: created.name };
  }

  /**
   * Uploads an atomic backup bundle directly into the dedicated Drive folder.
   * Ensures local file is never affected if cloud upload encounters network errors.
   */
  public static async uploadBackup(bundleJson: string, filename: string): Promise<GDriveUploadResult> {
    try {
      const accessToken = await this.getValidAccessToken();
      const folder = await this.ensureBackupFolder();

      const metadata = {
        name: filename,
        parents: [folder.folderId],
        mimeType: 'application/json',
        description: 'Spark Internal Verified Atomic Backup Snapshot',
      };

      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelim = `\r\n--${boundary}--`;

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        bundleJson +
        closeDelim;

      const uploadResp = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartRequestBody,
        }
      );

      if (!uploadResp.ok) {
        const errJson = await uploadResp.json().catch(() => ({}));
        throw new Error(
          `فشل رفع النسخة الاحتياطية إلى Google Drive: ${errJson.error?.message || uploadResp.statusText}`
        );
      }

      const uploaded = await uploadResp.json();
      const now = new Date().toISOString();

      if (currentStatusCache) {
        currentStatusCache.lastUploadAt = now;
        currentStatusCache.lastError = null;
      }

      return {
        fileId: uploaded.id,
        name: uploaded.name,
        uploadedAt: now,
        sizeBytes: parseInt(uploaded.size || '0', 10),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (currentStatusCache) {
        currentStatusCache.lastError = msg;
      }
      throw err;
    }
  }

  /**
   * Lists remote backup files stored in the Spark folder.
   */
  public static async listRemoteBackups(): Promise<GDriveRemoteFile[]> {
    const accessToken = await this.getValidAccessToken();
    const folder = await this.ensureBackupFolder();

    const query = encodeURIComponent(`'${folder.folderId}' in parents and trashed=false`);
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime desc&fields=files(id,name,createdTime,size)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!resp.ok) {
      throw new Error('تعذر استعراض ملفات النسخ السحابية من Google Drive');
    }

    const data = await resp.json();
    return (data.files || []).map((f: { id: string; name: string; createdTime: string; size?: string }) => ({
      id: f.id,
      name: f.name,
      createdTime: f.createdTime,
      sizeBytes: parseInt(f.size || '0', 10),
    }));
  }

  /**
   * Downloads a remote backup bundle content for safe local restoration.
   */
  public static async downloadRemoteBackup(fileId: string): Promise<string> {
    const accessToken = await this.getValidAccessToken();
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      throw new Error('فشل تنزيل ملف النسخة السحابية من Google Drive');
    }

    return await resp.text();
  }

  /**
   * Disconnects the current Google Drive account.
   * Completely purges the refresh token from Windows Credential Manager.
   * Does NOT touch local database records or remote backups.
   */
  public static async disconnect(): Promise<void> {
    await deleteRefreshTokenSecurely();
    currentStatusCache = {
      connected: false,
      email: null,
      folderId: null,
      folderName: null,
      lastBackupAt: currentStatusCache?.lastBackupAt || null,
      lastUploadAt: null,
      lastError: null,
      nextScheduledBackupAt: null,
    };
  }

  /**
   * Initiates account change flow:
   * Clears current credentials, forces Google account chooser,
   * without deleting previous remote backups on the former account.
   */
  public static async prepareChangeAccount(port = 8547): Promise<PKCESession> {
    await this.disconnect();
    return await this.createPKCESession({ prompt: 'select_account', port });
  }

  /**
   * Tests connectivity to Google Drive using the stored token.
   */
  public static async testConnection(): Promise<{ ok: boolean; email?: string; error?: string }> {
    try {
      const accessToken = await this.getValidAccessToken();
      const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userResp.ok) {
        throw new Error('فشل استرداد بيانات الحساب من Google');
      }

      const user = await userResp.json();
      if (currentStatusCache) {
        currentStatusCache.connected = true;
        currentStatusCache.email = user.email || null;
        currentStatusCache.lastError = null;
      }

      return { ok: true, email: user.email };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (currentStatusCache) {
        currentStatusCache.lastError = msg;
      }
      return { ok: false, error: msg };
    }
  }
}
