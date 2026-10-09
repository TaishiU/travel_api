import { userRepository } from '../repositories/user.js';
import { NotFoundError } from '../errors/AppError.js';
import type { UserUpdateInput } from '../schemas/user.js';

export const userService = {
    async getMe(userId: string) {
        const user = await userRepository.findProfile(userId);
        if (!user) throw new NotFoundError('ユーザーが見つかりません。');
        return user;
    },

    async updateMe(userId: string, input: UserUpdateInput) {
        const user = await userRepository.findProfile(userId);
        if (!user) throw new NotFoundError('ユーザーが見つかりません。');
        return userRepository.update(userId, input);
    },
};
