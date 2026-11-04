import { IsEmail, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LoginDTO {

    @IsEmail()
    @ApiProperty({example:'johndeo@example.com', description:'Email Address'})
    email!:string;

    @IsString()
    @ApiProperty({description:'Enter your password'})
    password!:string;
}