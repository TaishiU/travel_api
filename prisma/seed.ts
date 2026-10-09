/// <reference types="node" />
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL']! });
const prisma = new PrismaClient({ adapter });

async function main() {
    // エリア
    const japan = await prisma.area.upsert({
        where: { slug: 'japan' },
        update: {},
        create: {
            name: '日本',
            slug: 'japan',
            regionType: 'domestic',
            countryCode: 'JP',
            sortOrder: 1,
        },
    });

    const okinawa = await prisma.area.upsert({
        where: { slug: 'okinawa' },
        update: {},
        create: {
            parentId: japan.id,
            name: '沖縄',
            slug: 'okinawa',
            regionType: 'domestic',
            countryCode: 'JP',
            latitude: 26.2124,
            longitude: 127.6792,
            sortOrder: 1,
        },
    });

    await prisma.area.upsert({
        where: { slug: 'tokyo' },
        update: {},
        create: {
            parentId: japan.id,
            name: '東京',
            slug: 'tokyo',
            regionType: 'domestic',
            countryCode: 'JP',
            latitude: 35.6762,
            longitude: 139.6503,
            sortOrder: 2,
        },
    });

    // カテゴリ
    const marine = await prisma.category.upsert({
        where: { slug: 'marine' },
        update: {},
        create: {
            name: 'マリンスポーツ',
            slug: 'marine',
            sortOrder: 1,
        },
    });

    await prisma.category.upsert({
        where: { slug: 'sightseeing' },
        update: {},
        create: {
            name: '観光・ツアー',
            slug: 'sightseeing',
            sortOrder: 2,
        },
    });

    // アクティビティ
    const activity = await prisma.activity.upsert({
        where: { slug: 'okinawa-snorkeling' },
        update: {},
        create: {
            categoryId: marine.id,
            areaId: okinawa.id,
            title: '沖縄の海を楽しむシュノーケリング体験',
            slug: 'okinawa-snorkeling',
            shortDescription: '初心者でも安心！インストラクターがサポートします。',
            description: '沖縄の透明な海でシュノーケリングを楽しみましょう。熱帯魚や美しいサンゴ礁を間近で観察できます。',
            highlights: ['初心者歓迎', '器材レンタル込み', 'ホテル送迎あり', '少人数制（最大8名）'],
            status: 'published',
            minPrice: 5800,
            maxPrice: 8000,
            currency: 'JPY',
            averageRating: 4.8,
            reviewCount: 128,
            publishedAt: new Date(),
            images: {
                create: [
                    { url: 'https://placehold.co/800x600?text=Snorkeling+1', imageType: 'main', altText: 'シュノーケリング体験', sortOrder: 1 },
                    { url: 'https://placehold.co/800x600?text=Snorkeling+2', imageType: 'gallery', altText: 'サンゴ礁', sortOrder: 2 },
                ],
            },
        },
    });

    // プラン
    const plan = await prisma.plan.upsert({
        where: { id: 'plan-snorkeling-half-day' },
        update: {},
        create: {
            id: 'plan-snorkeling-half-day',
            activityId: activity.id,
            name: '半日シュノーケリングプラン',
            description: '午前中に集合し、約3時間の体験コース。',
            durationMinutes: 180,
            minParticipants: 1,
            maxParticipants: 8,
            status: 'active',
            bookingDeadlineMinutes: 1440,
            prices: {
                create: [
                    { participantType: 'adult', amount: 5800, currency: 'JPY' },
                    { participantType: 'child', amount: 3000, currency: 'JPY' },
                    { participantType: 'infant', amount: 0, currency: 'JPY' },
                ],
            },
            meetingPoints: {
                create: [
                    {
                        name: '那覇市内ホテルロビー（送迎）',
                        address: '沖縄県那覇市（送迎対応エリア）',
                        description: 'ホテルロビーにてピックアップ。',
                        accessInformation: '出発10分前までにロビーでお待ちください。',
                        meetingTime: '08:30',
                        isDefault: true,
                    },
                ],
            },
        },
    });

    // 在庫（今日から30日分）
    const today = new Date();
    const slots = [];
    for (let i = 1; i <= 30; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);

        const status = i % 7 === 0 ? 'not_operating' : 'available';
        const capacity = 8;
        const reservedQuantity = status === 'not_operating' ? 0 : Math.floor(Math.random() * 3);

        slots.push({
            planId: plan.id,
            serviceDate: date,
            startTime: '09:00',
            endTime: '12:00',
            capacity,
            reservedQuantity,
            status,
        });
    }

    await prisma.availabilitySlot.createMany({
        data: slots,
        skipDuplicates: true,
    });

    console.log('✅ Seed completed');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
