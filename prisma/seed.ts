
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './client/client';

const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter: pool });

function generateUserIdFromMaSV(maSV: string, ngaySinh: string): string {
  const firstTwoDigits = parseInt(maSV.substring(0, 2));
  const birthYear = parseInt(ngaySinh.split('/')[2]);
  
  // Nếu sinh năm 2007 thì không cộng 1, các năm khác thì cộng 1
  const yearPrefix = (birthYear === 2007 ? firstTwoDigits : firstTwoDigits + 1).toString();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${yearPrefix}${random}`;
}

function parseDateDDMMYYYY(dateStr: string): Date {
  const [day, month, year] = dateStr.split('/').map(s => parseInt(s));
  return new Date(year, month - 1, day);
}

async function main() {
  console.log('Start seeding...');

  // Hash password mặc định
  const defaultPassword = await bcrypt.hash('1111', 10);

  // Dữ liệu sinh viên
  const studentData = [
    {
      "maSV": "22051997",
      "hoTen": "Nguyễn Lê Hữu Hân",
      "ngaySinh": "14/05/1997",
      "soDienThoai": "0908483304",
      "email": "nguyenhan.fit.iuh@gmail.com"
    },
    {
      "maSV": "22061997",
      "hoTen": "Đinh Đại Lâm",
      "ngaySinh": "14/06/1997",
      "soDienThoai": "0888727379",
      "email": "ddlamqng@gmail.com"
    },
    {
      "maSV": "22665261",
      "hoTen": "Đinh Trần Công Chiến",
      "ngaySinh": "29/01/2004",
      "soDienThoai": "0979118048",
      "email": "cerkvena291@gmail.com"
    },
    {
      "maSV": "22666271",
      "hoTen": "Nguyễn Văn Hùng",
      "ngaySinh": "20/04/2004",
      "soDienThoai": "0962394267",
      "email": "nguyenhung2004200@gmail.com"
    },
    {
      "maSV": "22689731",
      "hoTen": "Nguyễn Hữu Việt",
      "ngaySinh": "03/06/2004",
      "soDienThoai": "0336017353",
      "email": "viethuu04sg@gmail.com"
    },
    {
      "maSV": "23647241",
      "hoTen": "Nguyễn Văn Bảo",
      "ngaySinh": "02/11/2005",
      "soDienThoai": "0386561120",
      "email": "bao927471@gmail.com"
    },
    {
      "maSV": "23659581",
      "hoTen": "Trần Tuấn Hưng",
      "ngaySinh": "12/09/2005",
      "soDienThoai": "0353133235",
      "email": "tuanhungvip12@gmail.com"
    },
    {
      "maSV": "23666161",
      "hoTen": "Nguyễn Việt Hoàng",
      "ngaySinh": "25/06/2004",
      "soDienThoai": "0964815302",
      "email": "hoangnguyen1157@gmail.com"
    },
    {
      "maSV": "23694461",
      "hoTen": "Đỗ Thanh Tường",
      "ngaySinh": "05/11/2005",
      "soDienThoai": "0336748385",
      "email": "dothanhtuong092020@gmail.com"
    },
    {
      "maSV": "23696901",
      "hoTen": "Trần Huỳnh Minh Kiệt",
      "ngaySinh": "05/10/2005",
      "soDienThoai": "0877619159",
      "email": "thminhkiet05@gmail.com"
    },
    {
      "maSV": "23736251",
      "hoTen": "Trần Thanh Xuân",
      "ngaySinh": "10/11/2005",
      "soDienThoai": "0378828279",
      "email": "Tranthanhxuan123123@gmail.com"
    },
    {
      "maSV": "24633571",
      "hoTen": "Lê Phước Tài",
      "ngaySinh": "03/05/2006",
      "soDienThoai": "0369551206",
      "email": "lephuoctai2006@gmail.com"
    },
    {
      "maSV": "24635361",
      "hoTen": "Nguyễn Minh Vũ",
      "ngaySinh": "02/07/2006",
      "soDienThoai": "0325939004",
      "email": "nguyenminhvu02072006@gmail.com"
    },
    {
      "maSV": "24636361",
      "hoTen": "Bùi Thái Vy",
      "ngaySinh": "17/10/2006",
      "soDienThoai": "0366409722",
      "email": "buithaivy2019@gmail.com"
    },
    {
      "maSV": "24638601",
      "hoTen": "Nguyễn Duy Khanh",
      "ngaySinh": "16/04/2006",
      "soDienThoai": "0398480573",
      "email": "lov3ursoul@gmail.com"
    },
    {
      "maSV": "24642841",
      "hoTen": "Trần Thị Tường Vân",
      "ngaySinh": "30/11/2006",
      "soDienThoai": "0899455821",
      "email": "tranthituongvan30@gmail.com"
    },
    {
      "maSV": "24653311",
      "hoTen": "Nguyễn Mai Minh Quý",
      "ngaySinh": "23/11/2006",
      "soDienThoai": "0903372311",
      "email": "maiminhquyn@gmail.com"
    },
    {
      "maSV": "24654011",
      "hoTen": "Chung Ngô Minh Hoàng",
      "ngaySinh": "26/08/2006",
      "soDienThoai": "0888105927",
      "email": "chunghoang26826@gmail.com"
    },
    {
      "maSV": "24656311",
      "hoTen": "Lê Hoàng Anh Trực",
      "ngaySinh": "01/11/2006",
      "soDienThoai": "0327867947",
      "email": "tle807835@gmail.com"
    },
    {
      "maSV": "24667331",
      "hoTen": "Nguyễn Ngọc Thi",
      "ngaySinh": "16/09/2006",
      "soDienThoai": "0963277056",
      "email": "ngocthipc11609@gmail.com"
    },
    {
      "maSV": "24668051",
      "hoTen": "Nguyễn Ngọc Thùy Dương",
      "ngaySinh": "24/01/2006",
      "soDienThoai": "0833173195",
      "email": "duongnguyen.24012006@gmail.com"
    },
    {
      "maSV": "24675951",
      "hoTen": "Phan Hoàng Luân",
      "ngaySinh": "20/05/2006",
      "soDienThoai": "0913067122",
      "email": "luanphanstudy@gmail.com"
    },
    {
      "maSV": "24678601",
      "hoTen": "Nguyễn Trung Hậu",
      "ngaySinh": "19/09/2006",
      "soDienThoai": "0783521747",
      "email": "hau.121747@gmail.com"
    },
    {
      "maSV": "24680831",
      "hoTen": "Đặng Thị Hồng Anh",
      "ngaySinh": "01/05/2006",
      "soDienThoai": "0867914283",
      "email": "dangthihonganh1@gmail.com"
    },
    {
      "maSV": "24697701",
      "hoTen": "Huỳnh Minh Quân",
      "ngaySinh": "12/02/2006",
      "soDienThoai": "0326891602",
      "email": "huynhquan.bl.1226@gmail.com"
    },
    {
      "maSV": "24716811",
      "hoTen": "Văn Sĩ Sang",
      "ngaySinh": "09/05/2006",
      "soDienThoai": "0376821803",
      "email": "van534230@gmail.com"
    },
    {
      "maSV": "24717591",
      "hoTen": "Nguyễn Gia Bảo",
      "ngaySinh": "22/12/2006",
      "soDienThoai": "0815985010",
      "email": "baog0299@gmail.com"
    },
    {
      "maSV": "24725141",
      "hoTen": "Nguyễn Xuân Việt Anh",
      "ngaySinh": "22/09/2005",
      "soDienThoai": "0976985746",
      "email": "vagaming122333@gmail.com"
    },
    {
      "maSV": "24729691",
      "hoTen": "Trần Thị Tình Vy",
      "ngaySinh": "05/03/2006",
      "soDienThoai": "0342637461",
      "email": "tvy69071@gmail.com"
    },
    {
      "maSV": "24730511",
      "hoTen": "Nguyễn Hữu Khang",
      "ngaySinh": "30/10/2006",
      "soDienThoai": "0387123645",
      "email": "dinhn5687@gmail.com"
    },
    {
      "maSV": "24739501",
      "hoTen": "Trần Lê Phúc Hưng",
      "ngaySinh": "14/09/2006",
      "soDienThoai": "0906096397",
      "email": "tranlephuchung14092006@gmail.com"
    },
    {
      "maSV": "25630541",
      "hoTen": "Dương Gia Huy",
      "ngaySinh": "03/04/2007",
      "soDienThoai": "0931850315",
      "email": "giahuy030407@gmail.com"
    },
    {
      "maSV": "25630931",
      "hoTen": "Nguyễn Bình Thanh Tâm",
      "ngaySinh": "25/01/2007",
      "soDienThoai": "0815825551",
      "email": "thanhtamppvp@gmail.com"
    },
    {
      "maSV": "25632591",
      "hoTen": "Phạm Minh Quân",
      "ngaySinh": "13/11/2007",
      "soDienThoai": "0938961127",
      "email": "nypham131107@gmail.com"
    },
    {
      "maSV": "25633101",
      "hoTen": "Nguyễn Đăng Dương",
      "ngaySinh": "29/09/2007",
      "soDienThoai": "0369743690",
      "email": "lmtgau@gmail.com"
    },
    {
      "maSV": "25633451",
      "hoTen": "Nguyễn Trọng Nhân",
      "ngaySinh": "23/11/2007",
      "soDienThoai": "0815758797",
      "email": "nhannguyen2311.07@gmail.com"
    },
    {
      "maSV": "25634161",
      "hoTen": "Nguyễn Thị Kim Ngân",
      "ngaySinh": "05/08/2007",
      "soDienThoai": "0338845347",
      "email": "truongan.11791@gmail.com"
    },
    {
      "maSV": "25638901",
      "hoTen": "Trang Thanh Thanh",
      "ngaySinh": "19/05/2007",
      "soDienThoai": "0819167036",
      "email": "trangthanh201905@gmail.com"
    },
    {
      "maSV": "25639571",
      "hoTen": "Dương Trọng Lễ",
      "ngaySinh": "25/09/2007",
      "soDienThoai": "0704701725",
      "email": "tronglelx2509@gmail.com"
    },
    {
      "maSV": "25641481",
      "hoTen": "Nguyễn Hoàng Phúc",
      "ngaySinh": "05/01/2007",
      "soDienThoai": "0339744676",
      "email": "nguyenphuc11962@gmail.com"
    },
    {
      "maSV": "25641671",
      "hoTen": "Trần Phước Thành",
      "ngaySinh": "14/06/2007",
      "soDienThoai": "0368284041",
      "email": "ricute069@gmail.com"
    },
    {
      "maSV": "25643391",
      "hoTen": "Trần Gia Tú",
      "ngaySinh": "06/11/2007",
      "soDienThoai": "0865569347",
      "email": "trangiatu.ame@gmail.com"
    },
    {
      "maSV": "25647271",
      "hoTen": "Tống Minh Duy",
      "ngaySinh": "16/07/2007",
      "soDienThoai": "0913182030",
      "email": "tongminhduynhut@gmail.com"
    },
    {
      "maSV": "25647851",
      "hoTen": "Đinh Gia Phú",
      "ngaySinh": "19/07/2007",
      "soDienThoai": "0387875964",
      "email": "giaphu.khh@gmail.com"
    },
    {
      "maSV": "25648131",
      "hoTen": "Ngô Văn Quân",
      "ngaySinh": "27/02/2007",
      "soDienThoai": "0326284573",
      "email": "nvquan520@gmail.com"
    },
    {
      "maSV": "25651221",
      "hoTen": "Lý Anh Huy",
      "ngaySinh": "05/09/2007",
      "soDienThoai": "0769630189",
      "email": "huyanh052222@gmail.com"
    },
    {
      "maSV": "25652141",
      "hoTen": "Trần Đăng Gia Bảo",
      "ngaySinh": "17/07/2007",
      "soDienThoai": "0783904288",
      "email": "gbao55612@gmail.com"
    },
    {
      "maSV": "25655161",
      "hoTen": "Lê Phạm Mỹ Hường",
      "ngaySinh": "16/01/2007",
      "soDienThoai": "0978235778",
      "email": "leehuong1610@gmail.com"
    },
    {
      "maSV": "25655491",
      "hoTen": "Nguyễn Ngọc Thái",
      "ngaySinh": "28/09/2007",
      "soDienThoai": "0915428238",
      "email": "ngocthai2007t@gmail.com"
    },
    {
      "maSV": "25661461",
      "hoTen": "Lê Hoài An",
      "ngaySinh": "07/10/2007",
      "soDienThoai": "0376654154",
      "email": "an1288052@gmail.com"
    },
    {
      "maSV": "25661811",
      "hoTen": "Nguyễn Hồng Cẩm Tú",
      "ngaySinh": "16/12/2007",
      "soDienThoai": "0968212508",
      "email": "camtu2007t@gmail.com"
    },
    {
      "maSV": "25662771",
      "hoTen": "Bùi Tấn Hưng",
      "ngaySinh": "31/10/2007",
      "soDienThoai": "0962475120",
      "email": "tanhung2007cg@gmail.com"
    },
    {
      "maSV": "25663651",
      "hoTen": "Trần Minh Hoàng",
      "ngaySinh": "08/11/2007",
      "soDienThoai": "0356647738",
      "email": "minhhoang.2007bt@gmail.com"
    },
    {
      "maSV": "25664401",
      "hoTen": "Nguyễn Quốc Quỳnh",
      "ngaySinh": "17/04/2007",
      "soDienThoai": "0797872210",
      "email": "nguyenquocquynh645@gmail.com"
    },
    {
      "maSV": "25666301",
      "hoTen": "Huỳnh Nguyễn Quỳnh Chi",
      "ngaySinh": "23/03/2007",
      "soDienThoai": "0355104633",
      "email": "chi2332007@gmail.com"
    },
    {
      "maSV": "25666571",
      "hoTen": "Bùi Trung Hiếu",
      "ngaySinh": "13/01/2007",
      "soDienThoai": "0325420018",
      "email": "buitrunghieu13012007@gmail.com"
    },
    {
      "maSV": "25667021",
      "hoTen": "Phạm Quốc Huy Hoàng",
      "ngaySinh": "24/08/2007",
      "soDienThoai": "0866960751",
      "email": "lasshas62@gmail.com"
    },
    {
      "maSV": "25668111",
      "hoTen": "Kha Bảo Anh",
      "ngaySinh": "01/10/2007",
      "soDienThoai": "0779011007",
      "email": "khabaoanht.a@gmail.com"
    },
    {
      "maSV": "25691521",
      "hoTen": "Tống Hoàng Phước Sang",
      "ngaySinh": "14/11/2007",
      "soDienThoai": "0819813331",
      "email": "thps1411@gmail.com"
    },
    {
      "maSV": "25695111",
      "hoTen": "Diệp Đình Hiếu",
      "ngaySinh": "27/07/2007",
      "soDienThoai": "0703500256",
      "email": "awhitedogidk@gmail.com"
    },
    {
      "maSV": "25698071",
      "hoTen": "Lý Đặng Minh Kiên",
      "ngaySinh": "12/08/2007",
      "soDienThoai": "0785120807",
      "email": "lykien574@gmail.com"
    },
    {
      "maSV": "25700361",
      "hoTen": "Trần Nguyễn Huyền Trân",
      "ngaySinh": "24/02/2007",
      "soDienThoai": "0842075939",
      "email": "htrantran242@gmail.com"
    },
    {
      "maSV": "25700451",
      "hoTen": "Lê Phương Quỳnh",
      "ngaySinh": "07/09/2007",
      "soDienThoai": "0355337635",
      "email": "leq025070@gmail.com"
    },
    {
      "maSV": "25701401",
      "hoTen": "Trương Thị Ngọc Quỳnh",
      "ngaySinh": "25/10/2007",
      "soDienThoai": "0868793830",
      "email": "mtiee25102007@gmail.com"
    },
    {
      "maSV": "25702651",
      "hoTen": "Bùi Công Tiển",
      "ngaySinh": "15/08/2007",
      "soDienThoai": "0944168096",
      "email": "buitienkuam@gmail.com"
    },
    {
      "maSV": "25704571",
      "hoTen": "Nguyễn Bảo Trinh",
      "ngaySinh": "16/04/2007",
      "soDienThoai": "0793279827",
      "email": "trinhnguyen.16042007@gmail.com"
    },
    {
      "maSV": "25705651",
      "hoTen": "Nguyễn Minh Khôi",
      "ngaySinh": "08/09/2007",
      "soDienThoai": "0789539384",
      "email": "minhkhoik07@gmail.com"
    },
    {
      "maSV": "25709981",
      "hoTen": "Lê Hồng Cường",
      "ngaySinh": "05/05/2007",
      "soDienThoai": "0368944409",
      "email": "lehongcuong27@gmail.com"
    },
    {
      "maSV": "25711771",
      "hoTen": "Lê Phương Thiện",
      "ngaySinh": "13/04/2007",
      "soDienThoai": "0775624539",
      "email": "heocon113960@gmail.com"
    },
    {
      "maSV": "25712511",
      "hoTen": "Nguyễn Trần Quốc Hào",
      "ngaySinh": "18/12/2007",
      "soDienThoai": "0971800467",
      "email": "nguyentranquochao.tlvn1@gmail.com"
    },
    {
      "maSV": "25715291",
      "hoTen": "Huỳnh Gia Thịnh",
      "ngaySinh": "16/12/2007",
      "soDienThoai": "0916884064",
      "email": "huynhgiathinh1317@gmail.com"
    },
    {
      "maSV": "25716401",
      "hoTen": "Hồ Triệu Hoàng",
      "ngaySinh": "13/03/2007",
      "soDienThoai": "0366894727",
      "email": "hotrieuhoang1@gmail.com"
    },
    {
      "maSV": "25717181",
      "hoTen": "Lê Minh Khang",
      "ngaySinh": "08/09/2007",
      "soDienThoai": "0948313971",
      "email": "lekhang13570@gmail.com"
    },
    {
      "maSV": "25720721",
      "hoTen": "Nguyễn Lê Thanh Hiền",
      "ngaySinh": "26/12/2007",
      "soDienThoai": "0387028289",
      "email": "thenhin59@gmail.com"
    },
    {
      "maSV": "25723321",
      "hoTen": "Hoàng Dương Thanh",
      "ngaySinh": "23/08/2007",
      "soDienThoai": "0582974354",
      "email": "Hoangduongthanh93@gmail.com"
    },
    {
      "maSV": "25726461",
      "hoTen": "Vũ Nhật Hào",
      "ngaySinh": "25/03/2007",
      "soDienThoai": "0846474475",
      "email": "vuhao00123@gmail.com"
    },
    {
      "maSV": "25728941",
      "hoTen": "Nguyễn Văn Dinh",
      "ngaySinh": "10/06/2007",
      "soDienThoai": "0373233625",
      "email": "nguyendinh771058@gmail.com"
    },
    {
      "maSV": "25730221",
      "hoTen": "Phạm Tuấn Kiệt",
      "ngaySinh": "10/05/2007",
      "soDienThoai": "0329062913",
      "email": "tuankietptk1507@gmail.com"
    },
    {
      "maSV": "25730521",
      "hoTen": "Huỳnh Phúc Lợi",
      "ngaySinh": "27/10/2007",
      "soDienThoai": "0335383315",
      "email": "huynhphucloi007@gmail.com"
    },
    {
      "maSV": "25732461",
      "hoTen": "Nguyễn Văn Bảo",
      "ngaySinh": "08/07/2007",
      "soDienThoai": "0332624160",
      "email": "bao84699@gmail.com"
    },
    {
      "maSV": "25738141",
      "hoTen": "Lê Khánh Đăng",
      "ngaySinh": "18/12/2007",
      "soDienThoai": "0396094915",
      "email": "dle181227@gmail.com"
    },
    {
      "maSV": "25742701",
      "hoTen": "Lê Trần Tân",
      "ngaySinh": "06/03/2007",
      "soDienThoai": "0812053144",
      "email": "letrantan74@gmail.com"
    },
    {
      "maSV": "25744511",
      "hoTen": "Huỳnh Thị Thúy Vy",
      "ngaySinh": "24/04/2007",
      "soDienThoai": "0392541638",
      "email": "hvy4777@gmail.com"
    },
    {
      "maSV": "25746591",
      "hoTen": "Nguyễn Thị Thảo Vy",
      "ngaySinh": "05/02/2007",
      "soDienThoai": "0394350988",
      "email": "nguyentvi0707@gmail.com"
    },
    {
      "maSV": "25752051",
      "hoTen": "Nguyễn Phan Hoài Linh",
      "ngaySinh": "01/03/2007",
      "soDienThoai": "0386647563",
      "email": "hoailinh260206@gmail.com"
    },
    {
      "maSV": "25753251",
      "hoTen": "Mai Thị Yến Nhi",
      "ngaySinh": "19/03/2007",
      "soDienThoai": "0395789435",
      "email": "maithiyennhi.lop92@gmail.com"
    },
    {
      "maSV": "22058191",
      "hoTen": "Đoàn Văn Hoàng",
      "ngaySinh": "01/01/1997",
      "soDienThoai": "0389956357",
      "email": "nimmnimm1357@gmail.com"
    }
  ];

  // Danh sách maSV của các user cần set ACTIVE (thêm maSV vào đây)
  const activeUserMaSV = [
    '23659581', // Trần Tuấn Hưng - ví dụ
    '24635361', // Nguyễn Lê Hữu Hân - ví dụ
    '22666271',
    '22058191',

  ];

  // Map dữ liệu sang User model
  const users = studentData.map(student => ({
    id: generateUserIdFromMaSV(student.maSV, student.ngaySinh),
    email: student.email,
    password: defaultPassword,
    fullName: student.hoTen,
    role: activeUserMaSV.includes(student.maSV) ? ('ADMIN' as const) : ('USER' as const),
    typeAuth: 'EMAIL' as const,
    status: activeUserMaSV.includes(student.maSV) ? ('ACTIVE' as const) : ('PENDING' as const),
    phone: student.soDienThoai,
    updatedAt: new Date(),
    metadata: {
      maSV: student.maSV,
      ngaySinh: student.ngaySinh,
    },
  }));

  // Lấy tất cả ID đã tồn tại trong database
  const existingUsers = await prisma.user.findMany({
    select: { id: true },
  });
  const usedIds = new Set<string>(existingUsers.map(u => u.id));

  // Đảm bảo không có ID trùng trong batch và database
  const uniqueUsers = users.map(user => {
    let userId = user.id;
    // Nếu ID bị trùng, generate lại
    while (usedIds.has(userId)) {
      const firstTwoDigits = parseInt(userId.substring(0, 2));
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      userId = `${firstTwoDigits}${random}`;
    }
    usedIds.add(userId);
    return { ...user, id: userId };
  });

  for (const user of uniqueUsers) {
    // Kiểm tra xem user đã tồn tại chưa
    const existingUser = await prisma.user.findUnique({
      where: { email: user.email },
    });

    if (existingUser) {
      // User đã tồn tại, update thông tin nhưng giữ nguyên ID
      await prisma.user.update({
        where: { email: user.email },
        data: {
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          status: user.status,
          metadata: user.metadata,
          updatedAt: user.updatedAt,
        },
      });
      console.log(`Updated user: ${user.email} (${user.fullName})`);
    } else {
      // User mới, tạo mới
      await prisma.user.create({
        data: user,
      });
      console.log(`Created user: ${user.email} (${user.fullName})`);
    }
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
