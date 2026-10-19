const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD = 30;
const DEFAULT_ALGORITHM = 'SHA1';

function stripSpaces(str) {
  return String(str || '').replace(/\s/g, '').toUpperCase();
}

function parseURLSearch(search) {
  // Keep values as strings: a Base32 secret can consist entirely of digits.
  return Object.fromEntries(new URLSearchParams(search || ''));
}

function parsePositiveInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

function parseAlgorithm(value) {
  const algorithm = String(value || '').toUpperCase();
  return ['SHA1', 'SHA256', 'SHA512'].includes(algorithm) ? algorithm : '';
}

const app = Vue.createApp({
  data() {
    return {
      secret_key: '',
      digits: DEFAULT_DIGITS,
      period: DEFAULT_PERIOD,
      algorithm: DEFAULT_ALGORITHM,
      parametersExpanded: false,
      updatingIn: 0,
      token: null,
      error: '',
      copyMessage: '',
      clipboardButton: null,
      intervalHandle: null,
    };
  },

  mounted() {
    this.getKeyFromUrl();
    this.getQueryParameters();
    this.update();
    this.intervalHandle = setInterval(() => this.update(), 1000);

    this.clipboardButton = Vue.markRaw(new ClipboardJS('#clipboard-button', {
      text: () => this.token || '',
    }));
    this.clipboardButton.on('success', (event) => {
      this.copyMessage = '验证码已复制。';
      event.clearSelection();
    });
    this.clipboardButton.on('error', () => {
      this.copyMessage = '复制失败，请手动选择验证码复制。';
    });
  },

  unmounted() {
    clearInterval(this.intervalHandle);
    if (this.clipboardButton) {
      this.clipboardButton.destroy();
    }
  },

  watch: {
    secret_key: 'update',
    digits: 'update',
    period: 'update',
    algorithm: 'update',
  },

  methods: {
    update() {
      const previousToken = this.token;
      this.token = null;
      this.updatingIn = 0;
      try {
        const secret = stripSpaces(this.secret_key);
        if (!secret) {
          this.error = '';
          this.copyMessage = '';
          return;
        }
        if (!/^[A-Z2-7]+={0,6}$/.test(secret)) {
          throw new Error('密钥必须是有效的 Base32 字符串（A–Z、2–7，可带末尾填充符）。');
        }
        const unpadded = secret.replace(/=+$/, '');
        const padding = secret.length - unpadded.length;
        const remainder = unpadded.length % 8;
        if (![0, 2, 4, 5, 7].includes(remainder) ||
            (padding > 0 && padding !== (8 - remainder) % 8)) {
          throw new Error('Base32 密钥长度或末尾填充无效。');
        }

        const period = parsePositiveInteger(this.period, 0, 1, 86400);
        const digits = parsePositiveInteger(this.digits, 0, 6, 8);
        const algorithm = parseAlgorithm(this.algorithm);
        if (!period || !digits) {
          this.parametersExpanded = true;
          throw new Error('验证码位数必须为 6–8，周期必须为 1–86400 秒。');
        }
        if (!algorithm) {
          this.parametersExpanded = true;
          throw new Error('算法必须为 SHA1、SHA256 或 SHA512。');
        }

        const totp = new OTPAuth.TOTP({
          algorithm,
          digits,
          period,
          secret: OTPAuth.Secret.fromBase32(secret),
        });
        const timestamp = Date.now();
        this.token = totp.generate({ timestamp });
        this.updatingIn = period - (Math.floor(timestamp / 1000) % period);
        this.error = '';
      } catch (error) {
        this.error = error.message || '无法生成验证码，请检查输入。';
      }
      if (this.token !== previousToken) {
        this.copyMessage = '';
      }
    },

    getKeyFromUrl() {
      const encodedKey = window.location.hash.replace(/^#\/*/, '');
      if (encodedKey) {
        try {
          this.secret_key = decodeURIComponent(encodedKey);
        } catch (error) {
          // Preserve malformed input so validation rejects it, rather than crashing startup.
          this.secret_key = encodedKey;
        }
      }
    },

    getQueryParameters() {
      const params = parseURLSearch(window.location.search);
      for (const [parameter, field] of [
        ['key', 'secret_key'], ['digits', 'digits'], ['period', 'period'], ['algorithm', 'algorithm'],
      ]) {
        if (Object.prototype.hasOwnProperty.call(params, parameter)) {
          this[field] = parameter === 'algorithm' ? params[parameter].toUpperCase() : params[parameter];
        }
      }
    },
  },
});

app.mount('#app');
