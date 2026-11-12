import { QuizDifficulty } from '@shared';

export interface QuizSeedQuestion {
  question: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  difficulty: QuizDifficulty;
}

export interface QuizSeedTopic {
  name: string;
  description: string;
  colorAccent: string;
  iconName: string;
  questions: QuizSeedQuestion[];
}

/**
 * Ngân hàng 56 câu hỏi tuyển chọn (curated questions bank)
 * Chia đều cho 4 chủ đề thuần Việt, cân bằng độ khó và tỉ lệ đáp án.
 */
export const QUIZ_SEED_TOPICS: QuizSeedTopic[] = [
  {
    name: 'Nông Nghiệp & Cây Trồng',
    description: 'Kiến thức trồng trọt, chăm sóc đất và nền nông nghiệp xanh',
    colorAccent: '#16A34A',
    iconName: 'eco',
    questions: [
      {
        question: 'Cây lúa nước là cây lương thực chủ yếu thuộc họ thực vật nào?',
        options: ['Họ Đậu (Fabaceae)', 'Họ Cà (Solanaceae)', 'Họ Hòa thảo (Poaceae)', 'Họ Hoa hồng (Rosaceae)'],
        correctIndex: 2,
        difficulty: 'easy',
      },
      {
        question: 'Loại đất nào phổ biến nhất ở vùng Đồng bằng sông Cửu Long và rất thích hợp để trồng lúa?',
        options: ['Đất phù sa', 'Đất cát pha', 'Đất đỏ bazan', 'Đất đá vôi'],
        correctIndex: 0,
        difficulty: 'easy',
      },
      {
        question: 'Phân bón NPK cung cấp cho cây trồng 3 nguyên tố dinh dưỡng đa lượng chính nào?',
        options: [
          'Natri - Phốt pho - Kali',
          'Đạm (N) - Lân (P) - Kali (K)',
          'Canxi - Magie - Kẽm',
          'Sắt - Đồng - Mangan',
        ],
        correctIndex: 1,
        difficulty: 'easy',
      },
      {
        question: 'Quá trình cây xanh sử dụng ánh sáng mặt trời để tạo chất hữu cơ được gọi là gì?',
        options: ['Hô hấp tế bào', 'Thoát hơi nước', 'Lên men tự nhiên', 'Quang hợp'],
        correctIndex: 3,
        difficulty: 'easy',
      },
      {
        question: 'Vựa lúa lớn nhất của Việt Nam hiện nay nằm ở vùng nào?',
        options: [
          'Đồng bằng sông Hồng',
          'Đồng bằng duyên hải miền Trung',
          'Đồng bằng sông Cửu Long',
          'Vùng Tây Nguyên',
        ],
        correctIndex: 2,
        difficulty: 'easy',
      },
      {
        question: 'Kỹ thuật canh tác luân canh có tác dụng quan trọng nhất là gì?',
        options: [
          'Tăng xói mòn đất canh tác',
          'Giảm sâu bệnh hại và giữ độ phì của đất',
          'Làm khô hạn nguồn nước ngầm',
          'Tăng chi phí thuốc bảo vệ thực vật',
        ],
        correctIndex: 1,
        difficulty: 'medium',
      },
      {
        question: 'Tỉnh nào được mệnh danh là thủ phủ cà phê của Việt Nam?',
        options: ['Đắk Lắk', 'Lâm Đồng', 'Bình Phước', 'Gia Lai'],
        correctIndex: 0,
        difficulty: 'medium',
      },
      {
        question: 'Chất diệp lục (chlorophyll) trong lá cây hấp thụ mạnh nhất ánh sáng có màu nào?',
        options: ['Xanh lục và vàng', 'Xanh lục và tím', 'Đỏ và xanh lam', 'Trắng và cam'],
        correctIndex: 2,
        difficulty: 'medium',
      },
      {
        question: 'Phương pháp tưới nào giúp tiết kiệm nước tối đa trong nông nghiệp công nghệ cao?',
        options: [
          'Tưới ngập tràn theo luống',
          'Tưới rãnh truyền thống',
          'Tưới tràn ven mương rãnh',
          'Tưới nhỏ giọt (drip irrigation)',
        ],
        correctIndex: 3,
        difficulty: 'medium',
      },
      {
        question: 'Độ pH lý tưởng của đất trồng đa số các loại cây hoa màu nằm trong khoảng nào?',
        options: ['2.0 - 3.5', '6.0 - 7.0', '9.0 - 10.5', '11.0 - 13.0'],
        correctIndex: 1,
        difficulty: 'medium',
      },
      {
        question: 'Nguyên tố vi lượng nào đóng vai trò kích thích nốt sần rễ cây họ Đậu cố định đạm khí quyển?',
        options: ['Molypden (Mo)', 'Chì (Pb)', 'Thủy ngân (Hg)', 'Asen (As)'],
        correctIndex: 0,
        difficulty: 'hard',
      },
      {
        question: 'Loại hoocmon thực vật nào kích thích sự chín của quả và rụng lá ở thực vật?',
        options: ['Auxin', 'Gibberellin', 'Cytokinin', 'Ethylene'],
        correctIndex: 3,
        difficulty: 'hard',
      },
      {
        question: 'Hiện tượng đất bị chua (axit hóa) thường được người nông dân khắc phục bằng biện pháp nào?',
        options: [
          'Bón thêm phân kali sunfat',
          'Bón vôi bột (CaO hoặc CaCO3)',
          'Tưới nhiều nước muối pha loãng',
          'Rải cát trắng mịn lên bề mặt',
        ],
        correctIndex: 1,
        difficulty: 'hard',
      },
      {
        question: 'Giống lúa ST25 - từng đạt giải Gạo ngon nhất thế giới được lai tạo bởi nhóm kỹ sư tại tỉnh nào?',
        options: ['An Giang', 'Đồng Tháp', 'Sóc Trăng', 'Long An'],
        correctIndex: 2,
        difficulty: 'hard',
      },
    ],
  },
  {
    name: 'Lịch Sử & Địa Danh Việt Nam',
    description: 'Khám phá các mốc son hào hùng và danh lam thắng cảnh đất nước',
    colorAccent: '#DC2626',
    iconName: 'history-edu',
    questions: [
      {
        question: 'Vị vua nào đã ban Chiếu dời đô từ Hoa Lư về Đại La vào năm 1010?',
        options: ['Lý Thái Tổ', 'Lý Nhân Tông', 'Trần Thái Tông', 'Lê Thái Tổ'],
        correctIndex: 0,
        difficulty: 'easy',
      },
      {
        question: 'Chiến thắng lịch sử Điện Biên Phủ lừng lẫy năm châu diễn ra vào năm nào?',
        options: ['1945', '1954', '1968', '1975'],
        correctIndex: 1,
        difficulty: 'easy',
      },
      {
        question: 'Quần đảo Hoàng Sa và Trường Sa thuộc chủ quyền thiêng liêng của quốc gia nào?',
        options: ['Thái Lan', 'Philippines', 'Việt Nam', 'Malaysia'],
        correctIndex: 2,
        difficulty: 'easy',
      },
      {
        question: 'Hang động tự nhiên lớn nhất thế giới hiện nay nằm ở tỉnh Quảng Bình có tên là gì?',
        options: ['Hang Đầu Gỗ', 'Động Phong Nha', 'Động Thiên Đường', 'Hang Sơn Đoòng'],
        correctIndex: 3,
        difficulty: 'easy',
      },
      {
        question: 'Di tích Cố đô Huế được UNESCO công nhận là Di sản Văn hóa Thế giới nằm ở miền nào?',
        options: ['Miền Bắc', 'Miền Nam', 'Miền Trung', 'Vùng Tây Nguyên'],
        correctIndex: 2,
        difficulty: 'easy',
      },
      {
        question: 'Ai là tác giả của bản Hịch tướng sĩ khích lệ tinh thần quân sĩ chống giặc Nguyên Mông?',
        options: [
          'Trần Quốc Tuấn (Trần Hưng Đạo)',
          'Quang Trung (Nguyễn Huệ)',
          'Nguyễn Trãi',
          'Phạm Ngũ Lão',
        ],
        correctIndex: 0,
        difficulty: 'medium',
      },
      {
        question: 'Hồ nước ngọt tự nhiên trên núi lớn nhất Việt Nam nằm ở tỉnh Bắc Kạn có tên là gì?',
        options: ['Hồ Thác Bà', 'Hồ Ba Bể', 'Hồ Tây', 'Hồ Trị An'],
        correctIndex: 1,
        difficulty: 'medium',
      },
      {
        question: 'Vương triều nào trong lịch sử phong kiến Việt Nam đã 3 lần đánh bại quân xâm lược Nguyên Mông?',
        options: ['Nhà Lý', 'Nhà Lê sơ', 'Nhà Nguyễn', 'Nhà Trần'],
        correctIndex: 3,
        difficulty: 'medium',
      },
      {
        question: 'Cột cờ Lũng Cú - điểm cực Bắc địa đầu Tổ quốc nằm trên địa bàn tỉnh nào?',
        options: ['Cao Bằng', 'Lạng Sơn', 'Hà Giang', 'Lào Cai'],
        correctIndex: 2,
        difficulty: 'medium',
      },
      {
        question: 'Trận thủy chiến lừng lẫy trên sông Bạch Đằng năm 938 do ai trực tiếp chỉ huy?',
        options: ['Lý Thường Kiệt', 'Ngô Quyền', 'Trần Khánh Dư', 'Đinh Bộ Lĩnh'],
        correctIndex: 1,
        difficulty: 'medium',
      },
      {
        question: 'Thành Cổ Loa hình xoáy ốc được xây dựng dưới thời kỳ trị vì của vị vua nào?',
        options: ['An Dương Vương (Thục Phán)', 'Hùng Vương thứ 18', 'Triệu Đà', 'Phùng Hưng'],
        correctIndex: 0,
        difficulty: 'hard',
      },
      {
        question: 'Địa danh nào sau đây được mệnh danh là Ngã ba Đông Dương nơi một con gà gáy ba nước cùng nghe?',
        options: [
          'A Pa Chải (Điện Biên)',
          'Hà Tiên (Kiên Giang)',
          'Cửa khẩu Bờ Y (Kon Tum)',
          'Lao Bảo (Quảng Trị)',
        ],
        correctIndex: 2,
        difficulty: 'hard',
      },
      {
        question: 'Bộ luật thành văn đầu tiên của nước Đại Việt được ban hành dưới thời nhà Lý có tên là gì?',
        options: [
          'Quốc triều hình luật (Luật Hồng Đức)',
          'Hình thư',
          'Hoàng Việt luật lệ (Luật Gia Long)',
          'Hình luật triều Trần',
        ],
        correctIndex: 1,
        difficulty: 'hard',
      },
      {
        question: 'Cầu Hiền Lương bắc qua con sông nào từng là ranh giới chia cắt hai miền Nam - Bắc năm 1954?',
        options: ['Sông Hương', 'Sông Thạch Hãn', 'Sông Gianh', 'Sông Bến Hải'],
        correctIndex: 3,
        difficulty: 'hard',
      },
    ],
  },
  {
    name: 'Khoa Học & Đời Sống',
    description: 'Hiện tượng tự nhiên, vũ trụ bí ẩn và công nghệ quanh ta',
    colorAccent: '#2563EB',
    iconName: 'science',
    questions: [
      {
        question: 'Chất khí nào chiếm thể tích lớn nhất (khoảng 78%) trong khí quyển Trái Đất?',
        options: ['Khí Oxy', 'Khí Carbon dioxide', 'Khí Nitơ', 'Khí Argon'],
        correctIndex: 2,
        difficulty: 'easy',
      },
      {
        question: 'Công thức hóa học của nước tinh khiết là gì?',
        options: ['CO2', 'H2O', 'NaCl', 'CH4'],
        correctIndex: 1,
        difficulty: 'easy',
      },
      {
        question: 'Hành tinh nào trong Hệ Mặt Trời được gọi là Hành tinh Đỏ do bề mặt chứa nhiều oxit sắt?',
        options: ['Sao Hỏa', 'Sao Kim', 'Sao Mộc', 'Sao Thủy'],
        correctIndex: 0,
        difficulty: 'easy',
      },
      {
        question: 'Trong cơ thể người trưởng thành, cơ quan nào chịu trách nhiệm chính lọc máu tạo nước tiểu?',
        options: ['Dạ dày', 'Phổi', 'Gan', 'Thận'],
        correctIndex: 3,
        difficulty: 'easy',
      },
      {
        question: 'Âm thanh truyền nhanh nhất trong môi trường nào sau đây?',
        options: [
          'Môi trường chất lỏng',
          'Môi trường chất rắn',
          'Môi trường chất khí',
          'Môi trường chân không',
        ],
        correctIndex: 1,
        difficulty: 'easy',
      },
      {
        question: 'Tế bào nào trong máu người đảm nhận chức năng vận chuyển oxy đi nuôi khắp cơ thể?',
        options: ['Bạch cầu trung tính', 'Tiểu cầu', 'Hồng cầu', 'Huyết tương'],
        correctIndex: 2,
        difficulty: 'medium',
      },
      {
        question: 'Đơn vị đo cường độ dòng điện trong hệ đo lường quốc tế (SI) là gì?',
        options: ['Ampe (A)', 'Vôn (V)', 'Oát (W)', 'Jun (J)'],
        correctIndex: 0,
        difficulty: 'medium',
      },
      {
        question: 'Loại vitamin nào được cơ thể người tự tổng hợp qua da dưới tác động của ánh nắng mặt trời?',
        options: ['Vitamin A', 'Vitamin B12', 'Vitamin C', 'Vitamin D'],
        correctIndex: 3,
        difficulty: 'medium',
      },
      {
        question: 'Ai là nhà khoa học phát hiện ra định luật vạn vật hấp dẫn khi quan sát quả táo rơi?',
        options: ['Albert Einstein', 'Galileo Galilei', 'Isaac Newton', 'Nikola Tesla'],
        correctIndex: 2,
        difficulty: 'medium',
      },
      {
        question: 'Khí gas hóa lỏng dùng trong nấu nướng dân dụng sinh hoạt chủ yếu gồm hai khí nào?',
        options: [
          'Khí Metan và Etylen',
          'Khí Propan và Butan',
          'Khí Acetylen và Benzen',
          'Khí Hidro và Heli',
        ],
        correctIndex: 1,
        difficulty: 'medium',
      },
      {
        question: 'Hiện tượng cầu vồng xuất hiện sau cơn mưa là kết quả của hiện tượng quang học nào?',
        options: [
          'Tán sắc và phản xạ ánh sáng trong giọt nước',
          'Giao thoa và nhiễu xạ ánh sáng đơn sắc',
          'Hấp thụ nhiệt của hơi nước trong mây',
          'Phân cực ánh sáng qua lớp ozon',
        ],
        correctIndex: 0,
        difficulty: 'hard',
      },
      {
        question: 'Loại hạt cơ bản nào mang điện tích âm và chuyển động xung quanh hạt nhân nguyên tử?',
        options: ['Proton', 'Neutron', 'Positron', 'Electron'],
        correctIndex: 3,
        difficulty: 'hard',
      },
      {
        question: 'Nguyên tố hóa học kim loại quý nào có ký hiệu là Au trong bảng tuần hoàn hóa học?',
        options: ['Bạc (Silver)', 'Bạch kim (Platinum)', 'Vàng (Gold)', 'Đồng (Copper)'],
        correctIndex: 2,
        difficulty: 'hard',
      },
      {
        question: 'Bán cầu não trái của con người thường giữ ưu thế chủ đạo trong việc xử lý chức năng nào?',
        options: [
          'Cảm thụ âm nhạc và hội họa',
          'Tư duy ngôn ngữ và logic tính toán',
          'Nhận diện không gian ba chiều',
          'Trực giác và cảm xúc nghệ thuật',
        ],
        correctIndex: 1,
        difficulty: 'hard',
      },
    ],
  },
  {
    name: 'Đố Vui Trí Tuệ',
    description: 'Câu hỏi tư duy logic, phản xạ nhanh và mẹo dân gian thú vị',
    colorAccent: '#D97706',
    iconName: 'psychology',
    questions: [
      {
        question: 'Cái gì người mua biết, người bán biết, nhưng người sử dụng trực tiếp lại không bao giờ biết?',
        options: ['Quan tài', 'Chiếc gương soi', 'Thuốc bổ mắt', 'Cái khẩu trang'],
        correctIndex: 0,
        difficulty: 'easy',
      },
      {
        question: 'Cái gì đi thì nằm, đứng thì nằm, nhưng lúc nằm ngủ thì lại đứng?',
        options: ['Con trăn gấm', 'Bàn chân con người', 'Con cá heo', 'Cái bóng của cột cờ'],
        correctIndex: 1,
        difficulty: 'easy',
      },
      {
        question: 'Càng kéo thì lại càng ngắn, câu đố dân gian này chỉ cái gì?',
        options: ['Sợi dây thun', 'Dây thả diều', 'Điếu thuốc lá đang hút', 'Cây thước kéo kim loại'],
        correctIndex: 2,
        difficulty: 'easy',
      },
      {
        question: 'Bỏ ngoài nướng trong, ăn ngoài bỏ trong là món ăn dân dã nào?',
        options: ['Bắp cải luộc', 'Bắp đùi gà rán', 'Thịt bò cuốn lá lốt', 'Bắp ngô (bắp ngô nướng)'],
        correctIndex: 3,
        difficulty: 'easy',
      },
      {
        question: 'Cây gì không lá không hoa, khi trời mưa đổ lại xòe ra che đầu?',
        options: ['Cây kim tiền', 'Cây dù (cây ô)', 'Cây nấm hương', 'Cây cột điện'],
        correctIndex: 1,
        difficulty: 'easy',
      },
      {
        question: 'Một xe tải nặng 10 tấn đi qua cây cầu chịu tải đúng 10 tấn. Chim nhỏ đậu lên xe nhưng cầu không sập vì sao?',
        options: [
          'Vì xe chạy qua cầu đã tiêu hao bớt một lượng nhiên liệu xăng dầu',
          'Cầu không thể sập vì chim quá nhẹ',
          'Vì xe chạy với tốc độ cao tạo lực nâng khí động học',
          'Vì trọng lượng xe được phân bổ đều ra bốn bánh',
        ],
        correctIndex: 0,
        difficulty: 'medium',
      },
      {
        question: 'Từ nào trong từ điển tiếng Việt mà tất cả mọi người đều phát âm là sai?',
        options: ['Từ đúng', 'Từ nhầm', 'Từ dối', 'Từ sai'],
        correctIndex: 3,
        difficulty: 'medium',
      },
      {
        question: 'Nhà Nam có bốn người con gồm: Xuân, Hạ, Thu. Người con thứ tư tên là gì?',
        options: ['Đông', 'Nam', 'Bắc', 'Phúc'],
        correctIndex: 1,
        difficulty: 'medium',
      },
      {
        question: 'Đi từ cực Bắc 5km về phía Nam, 5km về phía Đông, rồi 5km về phía Bắc về lại điểm xuất phát. Con gấu gặp có màu gì?',
        options: ['Gấu nâu', 'Gấu xám', 'Gấu trắng', 'Gấu trúc'],
        correctIndex: 2,
        difficulty: 'medium',
      },
      {
        question: 'Bác sĩ đưa cho bệnh nhân 3 viên thuốc và dặn cứ 30 phút uống 1 viên. Sau bao nhiêu phút sẽ uống hết?',
        options: ['90 phút', '60 phút', '30 phút', '45 phút'],
        correctIndex: 1,
        difficulty: 'medium',
      },
      {
        question: 'Cái gì tay trái của bạn có thể cầm được nhưng tay phải của bạn không bao giờ cầm được?',
        options: [
          'Khuỷu tay phải (cùi chỏ phải)',
          'Ngón tay cái của bàn tay trái',
          'Cổ tay trái của bạn',
          'Lòng bàn tay trái',
        ],
        correctIndex: 0,
        difficulty: 'hard',
      },
      {
        question: 'Bạn đang chạy đua và vượt qua người đang ở vị trí thứ nhì. Lúc này bạn đang ở vị trí thứ mấy?',
        options: ['Vị trí thứ nhất', 'Vị trí thứ ba', 'Vị trí thứ nhì', 'Vị trí áp chót'],
        correctIndex: 2,
        difficulty: 'hard',
      },
      {
        question: 'Có 3 quả táo trên bàn ăn, bạn đi tới và cầm lấy 2 quả đi. Hỏi hiện tại bạn có mấy quả táo?',
        options: ['1 quả táo', '3 quả táo', '0 quả táo', '2 quả táo'],
        correctIndex: 3,
        difficulty: 'hard',
      },
      {
        question: 'Lịch sử thế giới từng ghi nhận ngày 30 tháng 2 xuất hiện chính thức tại quốc gia nào vào năm 1712?',
        options: ['Nước Nga Sa hoàng', 'Vương quốc Anh', 'Đế quốc La Mã', 'Thụy Điển'],
        correctIndex: 3,
        difficulty: 'hard',
      },
    ],
  },
];
