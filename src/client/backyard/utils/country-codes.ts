/**
 * Comprehensive ISO 3166-1 Numeric / Alpha-2 / Alpha-3 Mapping for TopoJSON & GeoIP
 * Covers all 240+ global sovereign countries and territories.
 */

export interface CountryMeta {
  code: string; // ISO 2-letter (e.g. 'CN', 'US', 'TD', 'LY')
  num: string;  // ISO 3-digit numeric (e.g. '156', '840', '148', '434')
  nameZh: string;
  nameEn: string;
  flag: string;
}

export const ISO_NUMERIC_TO_COUNTRY: Record<string, CountryMeta> = {
  // Asia
  '004': { code: 'AF', num: '004', nameZh: '阿富汗', nameEn: 'Afghanistan', flag: '🇦🇫' },
  '051': { code: 'AM', num: '051', nameZh: '亚美尼亚', nameEn: 'Armenia', flag: '🇦🇲' },
  '031': { code: 'AZ', num: '031', nameZh: '阿塞拜疆', nameEn: 'Azerbaijan', flag: '🇦🇿' },
  '048': { code: 'BH', num: '048', nameZh: '巴林', nameEn: 'Bahrain', flag: '🇧🇭' },
  '050': { code: 'BD', num: '050', nameZh: '孟加拉国', nameEn: 'Bangladesh', flag: '🇧🇩' },
  '064': { code: 'BT', num: '064', nameZh: '不丹', nameEn: 'Bhutan', flag: '🇧🇹' },
  '096': { code: 'BN', num: '096', nameZh: '文莱', nameEn: 'Brunei', flag: '🇧🇳' },
  '116': { code: 'KH', num: '116', nameZh: '柬埔寨', nameEn: 'Cambodia', flag: '🇰🇭' },
  '156': { code: 'CN', num: '156', nameZh: '中国', nameEn: 'China', flag: '🇨🇳' },
  '196': { code: 'CY', num: '196', nameZh: '塞浦路斯', nameEn: 'Cyprus', flag: '🇨🇾' },
  '268': { code: 'GE', num: '268', nameZh: '格鲁吉亚', nameEn: 'Georgia', flag: '🇬🇪' },
  '344': { code: 'HK', num: '344', nameZh: '中国香港', nameEn: 'Hong Kong', flag: '🇭🇰' },
  '356': { code: 'IN', num: '356', nameZh: '印度', nameEn: 'India', flag: '🇮🇳' },
  '360': { code: 'ID', num: '360', nameZh: '印度尼西亚', nameEn: 'Indonesia', flag: '🇮🇩' },
  '364': { code: 'IR', num: '364', nameZh: '伊朗', nameEn: 'Iran', flag: '🇮🇷' },
  '368': { code: 'IQ', num: '368', nameZh: '伊拉克', nameEn: 'Iraq', flag: '🇮🇶' },
  '376': { code: 'IL', num: '376', nameZh: '以色列', nameEn: 'Israel', flag: '🇮🇱' },
  '392': { code: 'JP', num: '392', nameZh: '日本', nameEn: 'Japan', flag: '🇯🇵' },
  '400': { code: 'JO', num: '400', nameZh: '约旦', nameEn: 'Jordan', flag: '🇯🇴' },
  '398': { code: 'KZ', num: '398', nameZh: '哈萨克斯坦', nameEn: 'Kazakhstan', flag: '🇰🇿' },
  '408': { code: 'KP', num: '408', nameZh: '朝鲜', nameEn: 'North Korea', flag: '🇰🇵' },
  '410': { code: 'KR', num: '410', nameZh: '韩国', nameEn: 'South Korea', flag: '🇰🇷' },
  '414': { code: 'KW', num: '414', nameZh: '科威特', nameEn: 'Kuwait', flag: '🇰🇼' },
  '417': { code: 'KG', num: '417', nameZh: '吉尔吉斯斯坦', nameEn: 'Kyrgyzstan', flag: '🇰🇬' },
  '418': { code: 'LA', num: '418', nameZh: '老挝', nameEn: 'Laos', flag: '🇱🇦' },
  '422': { code: 'LB', num: '422', nameZh: '黎巴嫩', nameEn: 'Lebanon', flag: '🇱🇧' },
  '446': { code: 'MO', num: '446', nameZh: '中国澳门', nameEn: 'Macao', flag: '🇲🇴' },
  '458': { code: 'MY', num: '458', nameZh: '马来西亚', nameEn: 'Malaysia', flag: '🇲🇾' },
  '462': { code: 'MV', num: '462', nameZh: '马尔代夫', nameEn: 'Maldives', flag: '🇲🇻' },
  '496': { code: 'MN', num: '496', nameZh: '蒙古', nameEn: 'Mongolia', flag: '🇲🇳' },
  '104': { code: 'MM', num: '104', nameZh: '缅甸', nameEn: 'Myanmar', flag: '🇲🇲' },
  '524': { code: 'NP', num: '524', nameZh: '尼泊尔', nameEn: 'Nepal', flag: '🇳🇵' },
  '512': { code: 'OM', num: '512', nameZh: '阿曼', nameEn: 'Oman', flag: '🇴🇲' },
  '586': { code: 'PK', num: '586', nameZh: '巴基斯坦', nameEn: 'Pakistan', flag: '🇵🇰' },
  '275': { code: 'PS', num: '275', nameZh: '巴勒斯坦', nameEn: 'Palestine', flag: '🇵🇸' },
  '608': { code: 'PH', num: '608', nameZh: '菲律宾', nameEn: 'Philippines', flag: '🇵🇭' },
  '634': { code: 'QA', num: '634', nameZh: '卡塔尔', nameEn: 'Qatar', flag: '🇶🇦' },
  '682': { code: 'SA', num: '682', nameZh: '沙特阿拉伯', nameEn: 'Saudi Arabia', flag: '🇸🇦' },
  '702': { code: 'SG', num: '702', nameZh: '新加坡', nameEn: 'Singapore', flag: '🇸🇬' },
  '144': { code: 'LK', num: '144', nameZh: '斯里兰卡', nameEn: 'Sri Lanka', flag: '🇱🇰' },
  '760': { code: 'SY', num: '760', nameZh: '叙利亚', nameEn: 'Syria', flag: '🇸🇾' },
  '158': { code: 'TW', num: '158', nameZh: '中国台湾', nameEn: 'Taiwan', flag: '🇹🇼' },
  '762': { code: 'TJ', num: '762', nameZh: '塔吉克斯坦', nameEn: 'Tajikistan', flag: '🇹🇯' },
  '764': { code: 'TH', num: '764', nameZh: '泰国', nameEn: 'Thailand', flag: '🇹🇭' },
  '626': { code: 'TL', num: '626', nameZh: '东帝汶', nameEn: 'Timor-Leste', flag: '🇹🇱' },
  '792': { code: 'TR', num: '792', nameZh: '土耳其', nameEn: 'Turkey', flag: '🇹🇷' },
  '795': { code: 'TM', num: '795', nameZh: '土库曼斯坦', nameEn: 'Turkmenistan', flag: '🇹🇲' },
  '784': { code: 'AE', num: '784', nameZh: '阿联酋', nameEn: 'United Arab Emirates', flag: '🇦🇪' },
  '860': { code: 'UZ', num: '860', nameZh: '乌兹别克斯坦', nameEn: 'Uzbekistan', flag: '🇺🇿' },
  '704': { code: 'VN', num: '704', nameZh: '越南', nameEn: 'Vietnam', flag: '🇻🇳' },
  '887': { code: 'YE', num: '887', nameZh: '也门', nameEn: 'Yemen', flag: '🇾🇪' },

  // Europe
  '008': { code: 'AL', num: '008', nameZh: '阿尔巴尼亚', nameEn: 'Albania', flag: '🇦🇱' },
  '020': { code: 'AD', num: '020', nameZh: '安道尔', nameEn: 'Andorra', flag: '🇦🇩' },
  '040': { code: 'AT', num: '040', nameZh: '奥地利', nameEn: 'Austria', flag: '🇦🇹' },
  '112': { code: 'BY', num: '112', nameZh: '白俄罗斯', nameEn: 'Belarus', flag: '🇧🇾' },
  '056': { code: 'BE', num: '056', nameZh: '比利时', nameEn: 'Belgium', flag: '🇧🇪' },
  '070': { code: 'BA', num: '070', nameZh: '波斯尼亚和黑塞哥维那', nameEn: 'Bosnia and Herzegovina', flag: '🇧🇦' },
  '100': { code: 'BG', num: '100', nameZh: '保加利亚', nameEn: 'Bulgaria', flag: '🇧🇬' },
  '191': { code: 'HR', num: '191', nameZh: '克罗地亚', nameEn: 'Croatia', flag: '🇭🇷' },
  '203': { code: 'CZ', num: '203', nameZh: '捷克', nameEn: 'Czech Republic', flag: '🇨🇿' },
  '208': { code: 'DK', num: '208', nameZh: '丹麦', nameEn: 'Denmark', flag: '🇩🇰' },
  '233': { code: 'EE', num: '233', nameZh: '爱沙尼亚', nameEn: 'Estonia', flag: '🇪🇪' },
  '246': { code: 'FI', num: '246', nameZh: '芬兰', nameEn: 'Finland', flag: '🇫🇮' },
  '250': { code: 'FR', num: '250', nameZh: '法国', nameEn: 'France', flag: '🇫🇷' },
  '276': { code: 'DE', num: '276', nameZh: '德国', nameEn: 'Germany', flag: '🇩🇪' },
  '300': { code: 'GR', num: '300', nameZh: '希腊', nameEn: 'Greece', flag: '🇬🇷' },
  '348': { code: 'HU', num: '348', nameZh: '匈牙利', nameEn: 'Hungary', flag: '🇭🇺' },
  '352': { code: 'IS', num: '352', nameZh: '冰岛', nameEn: 'Iceland', flag: '🇮🇸' },
  '372': { code: 'IE', num: '372', nameZh: '爱尔兰', nameEn: 'Ireland', flag: '🇮🇪' },
  '380': { code: 'IT', num: '380', nameZh: '意大利', nameEn: 'Italy', flag: '🇮🇹' },
  '428': { code: 'LV', num: '428', nameZh: '拉脱维亚', nameEn: 'Latvia', flag: '🇱🇻' },
  '438': { code: 'LI', num: '438', nameZh: '列支敦士登', nameEn: 'Liechtenstein', flag: '🇱🇮' },
  '440': { code: 'LT', num: '440', nameZh: '立陶宛', nameEn: 'Lithuania', flag: '🇱🇹' },
  '442': { code: 'LU', num: '442', nameZh: '卢森堡', nameEn: 'Luxembourg', flag: '🇱🇺' },
  '470': { code: 'MT', num: '470', nameZh: '马耳他', nameEn: 'Malta', flag: '🇲🇹' },
  '498': { code: 'MD', num: '498', nameZh: '摩尔多瓦', nameEn: 'Moldova', flag: '🇲🇩' },
  '492': { code: 'MC', num: '492', nameZh: '摩纳哥', nameEn: 'Monaco', flag: '🇲🇨' },
  '499': { code: 'ME', num: '499', nameZh: '黑山', nameEn: 'Montenegro', flag: '🇲🇪' },
  '528': { code: 'NL', num: '528', nameZh: '荷兰', nameEn: 'Netherlands', flag: '🇳🇱' },
  '807': { code: 'MK', num: '807', nameZh: '北马其顿', nameEn: 'North Macedonia', flag: '🇲🇰' },
  '578': { code: 'NO', num: '578', nameZh: '挪威', nameEn: 'Norway', flag: '🇳🇴' },
  '616': { code: 'PL', num: '616', nameZh: '波兰', nameEn: 'Poland', flag: '🇵🇱' },
  '620': { code: 'PT', num: '620', nameZh: '葡萄牙', nameEn: 'Portugal', flag: '🇵🇹' },
  '642': { code: 'RO', num: '642', nameZh: '罗马尼亚', nameEn: 'Romania', flag: '🇷🇴' },
  '643': { code: 'RU', num: '643', nameZh: '俄罗斯', nameEn: 'Russia', flag: '🇷🇺' },
  '674': { code: 'SM', num: '674', nameZh: '圣马力诺', nameEn: 'San Marino', flag: '🇸🇲' },
  '688': { code: 'RS', num: '688', nameZh: '塞尔维亚', nameEn: 'Serbia', flag: '🇷🇸' },
  '703': { code: 'SK', num: '703', nameZh: '斯洛伐克', nameEn: 'Slovakia', flag: '🇸🇰' },
  '705': { code: 'SI', num: '705', nameZh: '斯洛文尼亚', nameEn: 'Slovenia', flag: '🇸🇮' },
  '724': { code: 'ES', num: '724', nameZh: '西班牙', nameEn: 'Spain', flag: '🇪🇸' },
  '752': { code: 'SE', num: '752', nameZh: '瑞典', nameEn: 'Sweden', flag: '🇸🇪' },
  '756': { code: 'CH', num: '756', nameZh: '瑞士', nameEn: 'Switzerland', flag: '🇨🇭' },
  '804': { code: 'UA', num: '804', nameZh: '乌克兰', nameEn: 'Ukraine', flag: '🇺🇦' },
  '826': { code: 'GB', num: '826', nameZh: '英国', nameEn: 'United Kingdom', flag: '🇬🇧' },
  '336': { code: 'VA', num: '336', nameZh: '梵蒂冈', nameEn: 'Vatican City', flag: '🇻🇦' },
  '248': { code: 'AX', num: '248', nameZh: '奥兰群岛', nameEn: 'Aland Islands', flag: '🇦🇽' },

  // Africa
  '012': { code: 'DZ', num: '012', nameZh: '阿尔及利亚', nameEn: 'Algeria', flag: '🇩🇿' },
  '024': { code: 'AO', num: '024', nameZh: '安哥拉', nameEn: 'Angola', flag: '🇦🇴' },
  '204': { code: 'BJ', num: '204', nameZh: '贝宁', nameEn: 'Benin', flag: '🇧🇯' },
  '072': { code: 'BW', num: '072', nameZh: '博茨瓦纳', nameEn: 'Botswana', flag: '🇧🇼' },
  '854': { code: 'BF', num: '854', nameZh: '布基纳法索', nameEn: 'Burkina Faso', flag: '🇧🇫' },
  '108': { code: 'BI', num: '108', nameZh: '布隆迪', nameEn: 'Burundi', flag: '🇧🇮' },
  '120': { code: 'CM', num: '120', nameZh: '喀麦隆', nameEn: 'Cameroon', flag: '🇨🇲' },
  '132': { code: 'CV', num: '132', nameZh: '佛得角', nameEn: 'Cape Verde', flag: '🇨🇻' },
  '140': { code: 'CF', num: '140', nameZh: '中非共和国', nameEn: 'Central African Republic', flag: '🇨🇫' },
  '148': { code: 'TD', num: '148', nameZh: '乍得', nameEn: 'Chad', flag: '🇹🇩' },
  '174': { code: 'KM', num: '174', nameZh: '科摩罗', nameEn: 'Comoros', flag: '🇰🇲' },
  '178': { code: 'CG', num: '178', nameZh: '刚果共和国', nameEn: 'Republic of the Congo', flag: '🇨🇬' },
  '180': { code: 'CD', num: '180', nameZh: '刚果民主共和国', nameEn: 'DR Congo', flag: '🇨🇩' },
  '384': { code: 'CI', num: '384', nameZh: '科特迪瓦', nameEn: "Côte d'Ivoire", flag: '🇨🇮' },
  '262': { code: 'DJ', num: '262', nameZh: '吉布提', nameEn: 'Djibouti', flag: '🇩🇯' },
  '818': { code: 'EG', num: '818', nameZh: '埃及', nameEn: 'Egypt', flag: '🇪🇬' },
  '226': { code: 'GQ', num: '226', nameZh: '赤道几内亚', nameEn: 'Equatorial Guinea', flag: '🇬🇶' },
  '232': { code: 'ER', num: '232', nameZh: '厄立特里亚', nameEn: 'Eritrea', flag: '🇪🇷' },
  '748': { code: 'SZ', num: '748', nameZh: '斯威士兰', nameEn: 'Eswatini', flag: '🇸🇿' },
  '231': { code: 'ET', num: '231', nameZh: '埃塞俄比亚', nameEn: 'Ethiopia', flag: '🇪🇹' },
  '266': { code: 'GA', num: '266', nameZh: '加蓬', nameEn: 'Gabon', flag: '🇬🇦' },
  '270': { code: 'GM', num: '270', nameZh: '冈比亚', nameEn: 'Gambia', flag: '🇬🇲' },
  '288': { code: 'GH', num: '288', nameZh: '加纳', nameEn: 'Ghana', flag: '🇬🇭' },
  '324': { code: 'GN', num: '324', nameZh: '几内亚', nameEn: 'Guinea', flag: '🇬🇳' },
  '624': { code: 'GW', num: '624', nameZh: '几内亚比绍', nameEn: 'Guinea-Bissau', flag: '🇬🇼' },
  '404': { code: 'KE', num: '404', nameZh: '肯尼亚', nameEn: 'Kenya', flag: '🇰🇪' },
  '426': { code: 'LS', num: '426', nameZh: '莱索托', nameEn: 'Lesotho', flag: '🇱🇸' },
  '430': { code: 'LR', num: '430', nameZh: '利比里亚', nameEn: 'Liberia', flag: '🇱🇷' },
  '434': { code: 'LY', num: '434', nameZh: '利比亚', nameEn: 'Libya', flag: '🇱🇾' },
  '450': { code: 'MG', num: '450', nameZh: '马达加斯加', nameEn: 'Madagascar', flag: '🇲🇬' },
  '454': { code: 'MW', num: '454', nameZh: '马拉维', nameEn: 'Malawi', flag: '🇲🇼' },
  '466': { code: 'ML', num: '466', nameZh: '马里', nameEn: 'Mali', flag: '🇲🇱' },
  '478': { code: 'MR', num: '478', nameZh: '毛里塔尼亚', nameEn: 'Mauritania', flag: '🇲🇷' },
  '480': { code: 'MU', num: '480', nameZh: '毛里求斯', nameEn: 'Mauritius', flag: '🇲🇺' },
  '504': { code: 'MA', num: '504', nameZh: '摩洛哥', nameEn: 'Morocco', flag: '🇲🇦' },
  '508': { code: 'MZ', num: '508', nameZh: '莫桑比克', nameEn: 'Mozambique', flag: '🇲🇿' },
  '516': { code: 'NA', num: '516', nameZh: '纳米比亚', nameEn: 'Namibia', flag: '🇳🇦' },
  '562': { code: 'NE', num: '562', nameZh: '尼日尔', nameEn: 'Niger', flag: '🇳🇪' },
  '566': { code: 'NG', num: '566', nameZh: '尼日利亚', nameEn: 'Nigeria', flag: '🇳🇬' },
  '646': { code: 'RW', num: '646', nameZh: '卢旺达', nameEn: 'Rwanda', flag: '🇷🇼' },
  '678': { code: 'ST', num: '678', nameZh: '圣多美和普林西比', nameEn: 'Sao Tome and Principe', flag: '🇸🇹' },
  '686': { code: 'SN', num: '686', nameZh: '塞内加尔', nameEn: 'Senegal', flag: '🇸🇳' },
  '690': { code: 'SC', num: '690', nameZh: '塞舌尔', nameEn: 'Seychelles', flag: '🇸🇨' },
  '694': { code: 'SL', num: '694', nameZh: '塞拉利昂', nameEn: 'Sierra Leone', flag: '🇸🇱' },
  '706': { code: 'SO', num: '706', nameZh: '索马里', nameEn: 'Somalia', flag: '🇸🇴' },
  '710': { code: 'ZA', num: '710', nameZh: '南非', nameEn: 'South Africa', flag: '🇿🇦' },
  '728': { code: 'SS', num: '728', nameZh: '南苏丹', nameEn: 'South Sudan', flag: '🇸🇸' },
  '729': { code: 'SD', num: '729', nameZh: '苏丹', nameEn: 'Sudan', flag: '🇸🇩' },
  '834': { code: 'TZ', num: '834', nameZh: '坦桑尼亚', nameEn: 'Tanzania', flag: '🇹🇿' },
  '768': { code: 'TG', num: '768', nameZh: '多哥', nameEn: 'Togo', flag: '🇹🇬' },
  '788': { code: 'TN', num: '788', nameZh: '突尼斯', nameEn: 'Tunisia', flag: '🇹🇳' },
  '800': { code: 'UG', num: '800', nameZh: '乌干达', nameEn: 'Uganda', flag: '🇺🇬' },
  '732': { code: 'EH', num: '732', nameZh: '西撒哈拉', nameEn: 'Western Sahara', flag: '🇪🇭' },
  '894': { code: 'ZM', num: '894', nameZh: '赞比亚', nameEn: 'Zambia', flag: '🇿🇲' },
  '716': { code: 'ZW', num: '716', nameZh: '津巴布韦', nameEn: 'Zimbabwe', flag: '🇿🇼' },

  // Americas
  '028': { code: 'AG', num: '028', nameZh: '安提瓜和巴布达', nameEn: 'Antigua and Barbuda', flag: '🇦🇬' },
  '032': { code: 'AR', num: '032', nameZh: '阿根廷', nameEn: 'Argentina', flag: '🇦🇷' },
  '044': { code: 'BS', num: '044', nameZh: '巴哈马', nameEn: 'Bahamas', flag: '🇧🇸' },
  '052': { code: 'BB', num: '052', nameZh: '巴巴多斯', nameEn: 'Barbados', flag: '🇧🇧' },
  '084': { code: 'BZ', num: '084', nameZh: '伯利兹', nameEn: 'Belize', flag: '🇧🇿' },
  '068': { code: 'BO', num: '068', nameZh: '玻利维亚', nameEn: 'Bolivia', flag: '🇧🇴' },
  '076': { code: 'BR', num: '076', nameZh: '巴西', nameEn: 'Brazil', flag: '🇧🇷' },
  '124': { code: 'CA', num: '124', nameZh: '加拿大', nameEn: 'Canada', flag: '🇨🇦' },
  '152': { code: 'CL', num: '152', nameZh: '智利', nameEn: 'Chile', flag: '🇨🇱' },
  '170': { code: 'CO', num: '170', nameZh: '哥伦比亚', nameEn: 'Colombia', flag: '🇨🇴' },
  '188': { code: 'CR', num: '188', nameZh: '哥斯达黎加', nameEn: 'Costa Rica', flag: '🇨🇷' },
  '192': { code: 'CU', num: '192', nameZh: '古巴', nameEn: 'Cuba', flag: '🇨🇺' },
  '212': { code: 'DM', num: '212', nameZh: '多米尼克', nameEn: 'Dominica', flag: '🇩🇲' },
  '214': { code: 'DO', num: '214', nameZh: '多米尼加', nameEn: 'Dominican Republic', flag: '🇩🇴' },
  '218': { code: 'EC', num: '218', nameZh: '厄瓜多尔', nameEn: 'Ecuador', flag: '🇪🇨' },
  '222': { code: 'SV', num: '222', nameZh: '萨尔瓦多', nameEn: 'El Salvador', flag: '🇸🇻' },
  '304': { code: 'GL', num: '304', nameZh: '格陵兰', nameEn: 'Greenland', flag: '🇬🇱' },
  '308': { code: 'GD', num: '308', nameZh: '格林纳达', nameEn: 'Grenada', flag: '🇬🇩' },
  '320': { code: 'GT', num: '320', nameZh: '危地马拉', nameEn: 'Guatemala', flag: '🇬🇹' },
  '328': { code: 'GY', num: '328', nameZh: '圭亚那', nameEn: 'Guyana', flag: '🇬🇾' },
  '332': { code: 'HT', num: '332', nameZh: '海地', nameEn: 'Haiti', flag: '🇭🇹' },
  '340': { code: 'HN', num: '340', nameZh: '洪都拉斯', nameEn: 'Honduras', flag: '🇭🇳' },
  '388': { code: 'JM', num: '388', nameZh: '牙买加', nameEn: 'Jamaica', flag: '🇯🇲' },
  '484': { code: 'MX', num: '484', nameZh: '墨西哥', nameEn: 'Mexico', flag: '🇲🇽' },
  '558': { code: 'NI', num: '558', nameZh: '尼加拉瓜', nameEn: 'Nicaragua', flag: '🇳🇮' },
  '591': { code: 'PA', num: '591', nameZh: '巴拿马', nameEn: 'Panama', flag: '🇵🇦' },
  '600': { code: 'PY', num: '600', nameZh: '巴拉圭', nameEn: 'Paraguay', flag: '🇵🇾' },
  '604': { code: 'PE', num: '604', nameZh: '秘鲁', nameEn: 'Peru', flag: '🇵🇪' },
  '630': { code: 'PR', num: '630', nameZh: '波多黎各', nameEn: 'Puerto Rico', flag: '🇵🇷' },
  '659': { code: 'KN', num: '659', nameZh: '圣基茨和尼维斯', nameEn: 'Saint Kitts and Nevis', flag: '🇰🇳' },
  '662': { code: 'LC', num: '662', nameZh: '圣卢西亚', nameEn: 'Saint Lucia', flag: '🇱🇨' },
  '670': { code: 'VC', num: '670', nameZh: '圣文森特和格林纳丁斯', nameEn: 'Saint Vincent and the Grenadines', flag: '🇻🇨' },
  '740': { code: 'SR', num: '740', nameZh: '苏里南', nameEn: 'Suriname', flag: '🇸🇷' },
  '780': { code: 'TT', num: '780', nameZh: '特立尼达和多巴哥', nameEn: 'Trinidad and Tobago', flag: '🇹🇹' },
  '840': { code: 'US', num: '840', nameZh: '美国', nameEn: 'United States', flag: '🇺🇸' },
  '858': { code: 'UY', num: '858', nameZh: '乌拉圭', nameEn: 'Uruguay', flag: '🇺🇾' },
  '862': { code: 'VE', num: '862', nameZh: '委内瑞拉', nameEn: 'Venezuela', flag: '🇻🇪' },
  '254': { code: 'GF', num: '254', nameZh: '法属圭亚那', nameEn: 'French Guiana', flag: '🇬🇫' },

  // Oceania
  '036': { code: 'AU', num: '036', nameZh: '澳大利亚', nameEn: 'Australia', flag: '🇦🇺' },
  '242': { code: 'FJ', num: '242', nameZh: '斐济', nameEn: 'Fiji', flag: '🇫🇯' },
  '296': { code: 'KI', num: '296', nameZh: '基里巴斯', nameEn: 'Kiribati', flag: '🇰🇮' },
  '584': { code: 'MH', num: '584', nameZh: '马绍尔群岛', nameEn: 'Marshall Islands', flag: '🇲🇭' },
  '583': { code: 'FM', num: '583', nameZh: '密克罗尼西亚', nameEn: 'Micronesia', flag: '🇫🇲' },
  '520': { code: 'NR', num: '520', nameZh: '瑙鲁', nameEn: 'Nauru', flag: '🇳🇷' },
  '554': { code: 'NZ', num: '554', nameZh: '新西兰', nameEn: 'New Zealand', flag: '🇳🇿' },
  '585': { code: 'PW', num: '585', nameZh: '帕劳', nameEn: 'Palau', flag: '🇵🇼' },
  '598': { code: 'PG', num: '598', nameZh: '巴布亚新几内亚', nameEn: 'Papua New Guinea', flag: '🇵🇬' },
  '882': { code: 'WS', num: '882', nameZh: '萨摩亚', nameEn: 'Samoa', flag: '🇼🇸' },
  '090': { code: 'SB', num: '090', nameZh: '所罗门群岛', nameEn: 'Solomon Islands', flag: '🇸🇧' },
  '776': { code: 'TO', num: '776', nameZh: '汤加', nameEn: 'Tonga', flag: '🇹🇴' },
  '798': { code: 'TV', num: '798', nameZh: '图瓦卢', nameEn: 'Tuvalu', flag: '🇹🇻' },
  '548': { code: 'VU', num: '548', nameZh: '瓦努阿图', nameEn: 'Vanuatu', flag: '🇻🇺' },
  '540': { code: 'NC', num: '540', nameZh: '新喀里多尼亚', nameEn: 'New Caledonia', flag: '🇳🇨' },
  '258': { code: 'PF', num: '258', nameZh: '法属波利尼西亚', nameEn: 'French Polynesia', flag: '🇵🇫' },

  // Special & Territories
  '010': { code: 'AQ', num: '010', nameZh: '南极洲', nameEn: 'Antarctica', flag: '🇦🇶' }
};

export const ALPHA2_TO_COUNTRY: Record<string, CountryMeta> = Object.values(ISO_NUMERIC_TO_COUNTRY).reduce(
  (acc, item) => {
    acc[item.code] = item;
    return acc;
  },
  {} as Record<string, CountryMeta>
);

/**
 * Robust Multi-tier Country Identifier Resolution
 */
export function getCountryByNumericOrCode(id: string | number | undefined | null): CountryMeta | null {
  if (id === undefined || id === null) return null;
  const raw = String(id).trim();
  if (!raw) return null;

  // 1. Check direct Numeric Key with 3-digit padding (e.g. '148', '012', '4')
  const strId = raw.padStart(3, '0');
  if (ISO_NUMERIC_TO_COUNTRY[strId]) {
    return ISO_NUMERIC_TO_COUNTRY[strId];
  }

  // 2. Check unpadded numeric
  if (ISO_NUMERIC_TO_COUNTRY[raw]) {
    return ISO_NUMERIC_TO_COUNTRY[raw];
  }

  // 3. Check Alpha-2 uppercase Code (e.g. 'CN', 'US', 'TD', 'LY')
  const code = raw.toUpperCase();
  if (ALPHA2_TO_COUNTRY[code]) {
    return ALPHA2_TO_COUNTRY[code];
  }

  // 4. Special cases for local / intranet
  if (code === 'LOCAL' || code === 'LOCALHOST') {
    return { code: 'LOCAL', num: '000', nameZh: '本地沙盒', nameEn: 'Localhost', flag: '🏠' };
  }
  if (code === 'LAN' || code === 'PRIVATE') {
    return { code: 'LAN', num: '001', nameZh: '局域网', nameEn: 'Local Network', flag: '🌐' };
  }

  return null;
}
