/*
 * @Author: shaoliye
 * @Date: 2026-04-24 15:34:43
 * @Email: shaoliye@fengmap.com
 * @LastEditTime: 2026-04-28 17:49:17
 * @LastEditors: shaoliye
 * @LastEditorsEmail: shaoliye@fengmap.com
 * @Description:
 * @Copyright: Copyright 1990 - 2026
 */
import { Injectable } from '@nestjs/common';

@Injectable()
export class TestService {
  getTest() {
    return { msg: 'hello nest my name is shaoliye this is a test message1232' };
  }

  getTest1() {
    return { msg: 'hello nest my name is shaoliye this is a test message11111231231'};
  }
}
