import { IsUrl, IsNotEmpty, IsString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateUrlDto {

    @IsString()
    @IsNotEmpty()
    @MaxLength(2048)
    @ApiProperty({example:'https://example.com', description:'A valid URL'})
    @IsUrl({
        protocols:['http','https'],
        require_protocol: true,
        require_valid_protocol: true
    })
    originalUrl:string;

}