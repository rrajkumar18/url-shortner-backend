import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
    
    @Transform(({value}) => typeof value == 'string' ? value.trim() : value)
    @IsString()
    @MinLength(1)
    @MaxLength(80)
    @Matches(/\S/, {message:"First Name cannot be blank"})
    @ApiProperty({example:'John', description:'First Name'})
    firstName!:string;

    @Transform(({value}) => typeof value == 'string' ? value.trim():value)
    @IsString()
    @MinLength(1)
    @MaxLength(80)
    @Matches(/\S/, {message:"Last Name cannot be blank"})
    @ApiProperty({example:'Doe', description:'Last Name'})
    lastName!:string;

    @Transform(({value}) => typeof value == 'string' ? value.trim().toLowerCase():value)
    @IsEmail()
    @ApiProperty({example:'johndeo@example.com', description:'Email Address'})
    email!:string;

    @IsString()
    @MinLength(8, {message:"Password must be at least 8 characters long"})
    @MaxLength(128, {message:"Password must not exceed 128 characters"})
    @Matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/,{message:"Password must be at least 8 characters long containing at least one Capital letter, one small letter, one digit and one special character"})
    @ApiProperty({example:'Abcde@123', description:'Password must be at least 8 characters long containing at least one Capital letter, one small letter, one digit and one special character'})
    password!:string;

}