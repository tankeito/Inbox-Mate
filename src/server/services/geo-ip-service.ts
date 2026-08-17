/**
 * High-performance offline GeoIP & Region Resolution Service
 */

export interface GeoLocation {
  countryCode: string;
  countryName: string;
  region: string;
  city?: string;
  flag: string;
}

const COUNTRY_MAP: Record<string, { name: string; flag: string }> = {
  CN: { name: '中国', flag: '🇨🇳' },
  US: { name: '美国', flag: '🇺🇸' },
  JP: { name: '日本', flag: '🇯🇵' },
  DE: { name: '德国', flag: '🇩🇪' },
  GB: { name: '英国', flag: '🇬🇧' },
  SG: { name: '新加坡', flag: '🇸🇬' },
  HK: { name: '中国香港', flag: '🇭🇰' },
  TW: { name: '中国台湾', flag: '🇹🇼' },
  KR: { name: '韩国', flag: '🇰🇷' },
  CA: { name: '加拿大', flag: '🇨🇦' },
  AU: { name: '澳大利亚', flag: '🇦🇺' },
  FR: { name: '法国', flag: '🇫🇷' },
  BR: { name: '巴西', flag: '🇧🇷' },
  RU: { name: '俄罗斯', flag: '🇷🇺' },
  IN: { name: '印度', flag: '🇮🇳' },
  NL: { name: '荷兰', flag: '🇳🇱' },
  ES: { name: '西班牙', flag: '🇪🇸' },
  IT: { name: '意大利', flag: '🇮🇹' },
  MX: { name: '墨西哥', flag: '🇲🇽' },
  VN: { name: '越南', flag: '🇻🇳' },
  TH: { name: '泰国', flag: '🇹🇭' },
  LOCAL: { name: '本地沙盒', flag: '🏠' },
  LAN: { name: '局域网', flag: '🌐' }
};

export class GeoIpService {
  /**
   * Resolves country code and region description from IP and optional region string
   */
  resolve(ip: string, rawRegion?: string): GeoLocation {
    const cleanIp = (ip || '').trim();

    // 1. Local / Private IP detection
    if (!cleanIp || cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') {
      return {
        countryCode: 'LOCAL',
        countryName: '本地沙盒',
        region: rawRegion || '本地 Localhost',
        flag: '🏠'
      };
    }

    if (
      cleanIp.startsWith('192.168.') ||
      cleanIp.startsWith('10.') ||
      cleanIp.startsWith('172.16.') ||
      cleanIp.startsWith('172.17.') ||
      cleanIp.startsWith('172.18.') ||
      cleanIp.startsWith('172.19.') ||
      cleanIp.startsWith('172.2') ||
      cleanIp.startsWith('172.3')
    ) {
      return {
        countryCode: 'LAN',
        countryName: '局域网',
        region: rawRegion || '局域网 (LAN)',
        flag: '🌐'
      };
    }

    // 2. Resolve from raw region text if available
    if (rawRegion) {
      const reg = rawRegion.toLowerCase();
      if (reg.includes('中国') || reg.includes('北京') || reg.includes('上海') || reg.includes('广东') || reg.includes('深圳') || reg.includes('浙江') || reg.includes('江苏')) {
        return { countryCode: 'CN', countryName: '中国', region: rawRegion, flag: '🇨🇳' };
      }
      if (reg.includes('香港') || reg.includes('hong kong')) {
        return { countryCode: 'HK', countryName: '中国香港', region: rawRegion, flag: '🇭🇰' };
      }
      if (reg.includes('台湾') || reg.includes('taiwan')) {
        return { countryCode: 'TW', countryName: '中国台湾', region: rawRegion, flag: '🇹🇼' };
      }
      if (reg.includes('美国') || reg.includes('united states') || reg.includes('俄勒冈') || reg.includes('加利福尼亚') || reg.includes('硅谷') || reg.includes('纽约')) {
        return { countryCode: 'US', countryName: '美国', region: rawRegion, flag: '🇺🇸' };
      }
      if (reg.includes('日本') || reg.includes('japan') || reg.includes('东京') || reg.includes('大阪')) {
        return { countryCode: 'JP', countryName: '日本', region: rawRegion, flag: '🇯🇵' };
      }
      if (reg.includes('德国') || reg.includes('germany') || reg.includes('法兰克福') || reg.includes('柏林')) {
        return { countryCode: 'DE', countryName: '德国', region: rawRegion, flag: '🇩🇪' };
      }
      if (reg.includes('英国') || reg.includes('united kingdom') || reg.includes('伦敦')) {
        return { countryCode: 'GB', countryName: '英国', region: rawRegion, flag: '🇬🇧' };
      }
      if (reg.includes('新加坡') || reg.includes('singapore')) {
        return { countryCode: 'SG', countryName: '新加坡', region: rawRegion, flag: '🇸🇬' };
      }
      if (reg.includes('韩国') || reg.includes('korea') || reg.includes('首尔')) {
        return { countryCode: 'KR', countryName: '韩国', region: rawRegion, flag: '🇰🇷' };
      }
      if (reg.includes('加拿大') || reg.includes('canada') || reg.includes('多伦多') || reg.includes('温哥华')) {
        return { countryCode: 'CA', countryName: '加拿大', region: rawRegion, flag: '🇨🇦' };
      }
      if (reg.includes('澳大利亚') || reg.includes('australia') || reg.includes('悉尼') || reg.includes('墨尔本')) {
        return { countryCode: 'AU', countryName: '澳大利亚', region: rawRegion, flag: '🇦🇺' };
      }
      if (reg.includes('法国') || reg.includes('france') || reg.includes('巴黎')) {
        return { countryCode: 'FR', countryName: '法国', region: rawRegion, flag: '🇫🇷' };
      }
      if (reg.includes('巴西') || reg.includes('brazil') || reg.includes('圣保罗')) {
        return { countryCode: 'BR', countryName: '巴西', region: rawRegion, flag: '🇧🇷' };
      }
      if (reg.includes('俄罗斯') || reg.includes('russia') || reg.includes('莫斯科')) {
        return { countryCode: 'RU', countryName: '俄罗斯', region: rawRegion, flag: '🇷🇺' };
      }
      if (reg.includes('西班牙') || reg.includes('spain') || reg.includes('马德里')) {
        return { countryCode: 'ES', countryName: '西班牙', region: rawRegion, flag: '🇪🇸' };
      }
      if (reg.includes('墨西哥') || reg.includes('mexico')) {
        return { countryCode: 'MX', countryName: '墨西哥', region: rawRegion, flag: '🇲🇽' };
      }
      if (reg.includes('荷兰') || reg.includes('netherlands') || reg.includes('阿姆斯特丹')) {
        return { countryCode: 'NL', countryName: '荷兰', region: rawRegion, flag: '🇳🇱' };
      }
    }

    // 3. Fallback to offline IP prefix heuristics
    const firstOctet = parseInt(cleanIp.split('.')[0] || '0', 10);
    if (firstOctet === 47 || firstOctet === 133 || firstOctet === 150) {
      return { countryCode: 'JP', countryName: '日本', region: '日本 (东京/大阪)', flag: '🇯🇵' };
    }
    if (firstOctet === 8 || firstOctet === 1 || firstOctet === 4 || firstOctet === 66 || firstOctet === 208 || firstOctet === 216 || firstOctet === 104 || firstOctet === 198) {
      return { countryCode: 'US', countryName: '美国', region: '美国 (North America)', flag: '🇺🇸' };
    }
    if (firstOctet === 20 || firstOctet === 142 || firstOctet === 199) {
      return { countryCode: 'CA', countryName: '加拿大', region: '加拿大 (多伦多)', flag: '🇨🇦' };
    }
    if (firstOctet === 68 || firstOctet === 185) {
      return { countryCode: 'ES', countryName: '西班牙', region: '西班牙 (马德里)', flag: '🇪🇸' };
    }
    if (firstOctet === 114 || firstOctet === 223 || firstOctet === 180 || firstOctet === 183 || firstOctet === 203 || firstOctet === 220 || firstOctet === 218 || firstOctet === 124) {
      return { countryCode: 'CN', countryName: '中国', region: '中国 (亚太节点)', flag: '🇨🇳' };
    }

    return {
      countryCode: 'US',
      countryName: '美国',
      region: rawRegion || '国际节点 (Global Transit)',
      flag: '🇺🇸'
    };
  }

  getCountryMeta(countryCode: string) {
    return COUNTRY_MAP[countryCode] || { name: countryCode, flag: '🌐' };
  }
}

export const geoIpService = new GeoIpService();
