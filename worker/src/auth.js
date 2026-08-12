import {
  decodeProtectedHeader,
  importX509,
  jwtVerify,
} from "jose";

const FIREBASE_PROJECT_ID = "lyst-e2185";
const FIREBASE_ISSUER =
  `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let firebaseCertCache = null;
let firebaseCertExpiry = 0;

async function getFirebaseCerts() {
  const now =
    Date.now();

  if (
    firebaseCertCache &&
    now <
      firebaseCertExpiry
  ) {
    return firebaseCertCache;
  }

  const response =
    await fetch(
      FIREBASE_CERTS_URL,
    );

  if (!response.ok) {
    throw new Error(
      "Could not fetch Firebase public keys.",
    );
  }

  const certs =
    await response.json();

  const cacheControl =
    response.headers.get(
      "Cache-Control",
    ) || "";

  const maxAgeMatch =
    cacheControl.match(
      /max-age=(\d+)/i,
    );

  const maxAgeSeconds =
    maxAgeMatch
      ? Number(
          maxAgeMatch[1],
        )
      : 3600;

  firebaseCertCache =
    certs;

  firebaseCertExpiry =
    now +
    Math.max(
      300,
      maxAgeSeconds - 60,
    ) *
      1000;

  return certs;
}

export async function verifyFirebaseIdToken(
  token,
) {
  const header =
    decodeProtectedHeader(
      token,
    );

  if (
    header.alg !== "RS256" ||
    !header.kid
  ) {
    throw new Error(
      "Invalid Firebase token header.",
    );
  }

  let certs =
    await getFirebaseCerts();

  let certificate =
    certs[
      header.kid
    ];

  if (!certificate) {
    firebaseCertCache =
      null;

    firebaseCertExpiry =
      0;

    certs =
      await getFirebaseCerts();

    certificate =
      certs[
        header.kid
      ];
  }

  if (!certificate) {
    throw new Error(
      "Unknown Firebase signing key.",
    );
  }

  const publicKey =
    await importX509(
      certificate,
      "RS256",
    );

  const {
    payload,
  } =
    await jwtVerify(
      token,
      publicKey,
      {
        audience:
          FIREBASE_PROJECT_ID,

        issuer:
          FIREBASE_ISSUER,

        algorithms: [
          "RS256",
        ],
      },
    );

  const nowSeconds =
    Math.floor(
      Date.now() /
        1000,
    );

  if (
    !payload.sub ||
    typeof payload.sub !==
      "string" ||
    payload.sub.length >
      128
  ) {
    throw new Error(
      "Invalid Firebase subject.",
    );
  }

  if (
    typeof payload.auth_time !==
      "number" ||
    payload.auth_time >
      nowSeconds
  ) {
    throw new Error(
      "Invalid Firebase auth time.",
    );
  }

  return {
    uid:
      payload.sub,
  };
}

export function getBearerToken(
  request,
) {
  const authorization =
    request.headers.get(
      "Authorization",
    ) || "";

  if (
    !authorization.startsWith(
      "Bearer ",
    )
  ) {
    return "";
  }

  return authorization
    .slice(7)
    .trim();
}


