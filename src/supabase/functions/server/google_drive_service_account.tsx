// Google Drive Service Account Helper
// Service Account ile Google Drive dosyalarını indirir (referrer restriction yok)

// 🔐 Service Account Credentials (hardcoded)
// ⚠️ Bu bilgiler sadece backend'de kalır, frontend'e asla gönderilmez
const SERVICE_ACCOUNT = {
  "type": "service_account",
  "project_id": "ilsa-483020",
  "private_key_id": "a7eefaaf6a4e411eab24534ef6e0900582e86e0a",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCvKzVapz8YtxCE\nRUGH5WABfs+K/3tT/P7KLNlnWaE1icrB7l5vRcLxdr1zfaZydfPM5cYxN0+ImWiR\ndZM209mExugSLowbRymW4StUm3IQ5OzQ+DJhbOsW6lw7FgcN64OchnLFOKayJfmT\nDo5EICtkWqlvsI//7hSRpgvjkxCNKfTkgeLnFzEn6mufBQ1qCZ7e0Y3IjCjaPkAE\n3ooiXj/jcj8nJbb1xRgeJxQnf/uraD0leaaqjJwu7A1aXLGma6XGNGEOnB7NSH1S\nYEZRuDBMmEpMhlGg/p4vDFrHX/pfiYI5wQN2C2a4N0UGyJEpuAHCIIPLMRKUuhEt\nm6i52QS/AgMBAAECggEAPptbYPC4yP0ZDqVwJAGT3ET2KdBhRGX+rMT12Q38Y9XB\nXan0H6IX6FSPptkIZg2JWzjeqtWBfCmUabTTrntuWZn79Q+k7NT05OPKqF08mhQw\nHgove4nBxnlyCH45fDyqWAXnvFygm7id6HUB3RCAYchTmcNJ3Ge7+0iVJDv6ZPE7\nLQELiW/WZ8blQ9CtoZcXHIbj5Yo+vkpgZzB1yNNcYX8a5THAml/K0EsqrM1DqpIZ\n2W7/AeVyGhpP4FTKnRPv803TG+rGFjtfhvjg+rXoP+PPuEqxMVJayZiYhABufTBD\nhE2wK3th+5L9DmijiKW8SsTieV7QrRN8+Lb2edfePQKBgQDs8NXG3iAtcw29dTKp\nfRSJC3BlPyqiMt7ujyGZMDbR/Ae0u2laIsDI3gomGMMRZiAI97kfOc94p8qta2v2\nG+bET5md71+GRcCOsS0Z5ghoTSIZqnzsjRZ//RYqr0g17mPo2mKb1r391erZplNu\nrQsKgV52tpC5EzwoWzAVlfM5pQKBgQC9Qlf8r1Bn9XB5sgnZ4w79nyjpfgpV0l83\nvMHopyrPRKzWoHkXFAfBdEGkNDFmGae+BHD/ehbZ4YVuhxmpu7/C7hGNdP/XIyLG\nLrOCl0YFFVjDDN11qwpin5aWxz6kgWxTPTlF65UGDT6+3xpaG6d8Sd2VpL8al9W0\nAoaZv8FPkwKBgQDJX2og6VnpprYPxhJ3r+GLE9jDg+rlDV0g3S7N9gcxcgTOmtVQ\nEOdOEEAJ3tOy7tvdI0UHf+ePgPOlbf3EnjQDti815mKGSLP90iEluLZ+hserjpU7\nqjFsN5nmTzCM/X2WQjy6e8jfejZuIokYMCOJGyhAtqrLUMi4978nKVkdLQKBgDL+\n/Gxm5NiORvdTpNnkF7b5OvHnd2t2mxeOsgU5fgyJabUPWnGAgTJ8W++d7K2hPhSy\nZ6w/PocJAIYuuxiEMYCZ23rtSr6yhf02ukH29vQJs3gjME0zgEHg1JfeKh/zi7fG\nKHeRqf8OdJjDzvr2tqOD18QptyC4RuoRQCmPhMwnAoGAHscFIKPCwMxuO0knKv43\nRDMwINsWxxcwDdF5DkxZjlatk3eXxTRZhD0M6yfBT96bYB74YjeaFrZpGsbe6I5C\n+HvRMGZVxbMWeP+P6u/xKrZXw9XdwFdO/y9lWW/j/biKxYs0Wp1PbWGZltLgNvC7\n7HGLePGz9i7moecQ39vjL5c=\n-----END PRIVATE KEY-----\n",
  "client_email": "ilsasupport@ilsa-483020.iam.gserviceaccount.com",
  "client_id": "117830640061434218939",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/ilsasupport%40ilsa-483020.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};

/**
 * Service Account için JWT (JSON Web Token) oluşturur
 */
async function createJWT(serviceAccount: any): Promise<string> {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: serviceAccount.token_uri,
    exp: now + 3600, // 1 saat
    iat: now,
  };

  // Base64URL encode
  const base64url = (str: string) => {
    return btoa(str)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // Private key'i import et
  const privateKey = serviceAccount.private_key;
  
  // PKCS8 formatından key çıkar
  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';
  const pemContents = privateKey
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\s/g, '');
  
  // Base64 decode
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  // CryptoKey oluştur
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  // İmzala
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  // Signature'ı base64url encode et
  const signatureBase64url = base64url(
    String.fromCharCode(...new Uint8Array(signature))
  );

  return `${unsignedToken}.${signatureBase64url}`;
}

/**
 * JWT ile access token alır
 */
async function getAccessToken(serviceAccount: any): Promise<string> {
  const jwt = await createJWT(serviceAccount);

  const response = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Access token alma hatası:', error);
    throw new Error(`Access token error: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Service Account ile Google Drive dosyasını indirir
 * @param fileId - Google Drive file ID
 * @returns Response stream
 */
export async function downloadWithServiceAccount(
  fileId: string
): Promise<Response> {
  try {
    console.log('🔐 Service Account ile indirme başlatılıyor...');
    
    // Access token al
    const accessToken = await getAccessToken(SERVICE_ACCOUNT);
    console.log('✅ Access token alındı');

    const q = new URLSearchParams({
      alt: 'media',
      acknowledgeAbuse: 'true',
      supportsAllDrives: 'true',
    });
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${q.toString()}`;

    console.log(`📥 Dosya indiriliyor: ${fileId}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Google Drive API hatası: ${response.status}`);
      console.error('Detay:', error);
      
      // Parse error
      let errorObj;
      try {
        errorObj = JSON.parse(error);
      } catch {
        errorObj = { message: error };
      }
      
      // Özel hata mesajları
      if (response.status === 404) {
        throw new Error('Dosya bulunamadı. File ID doğru mu?');
      } else if (response.status === 403) {
        throw new Error(
          'Erişim reddedildi. Dosya "Anyone with the link" olarak paylaşılmalı VEYA ' +
          `Service Account email'ine (${SERVICE_ACCOUNT.client_email}) paylaşılmalı.`
        );
      } else {
        throw new Error(errorObj.error?.message || `API error: ${response.status}`);
      }
    }

    console.log('✅ Dosya başarıyla indirildi');
    return response;
    
  } catch (error) {
    console.error('❌ Service Account indirme hatası:', error);
    throw error;
  }
}

/**
 * Service Account ile dosya metadata'sını alır
 */
export async function getFileMetadataWithServiceAccount(
  fileId: string
): Promise<any> {
  try {
    const accessToken = await getAccessToken(SERVICE_ACCOUNT);

    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,size,mimeType&supportsAllDrives=true`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Metadata error: ${response.status} - ${error}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Metadata alma hatası:', error);
    throw error;
  }
}