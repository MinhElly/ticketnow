package com.minh.ticketservice.service;

import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.util.Base64;

@Service
@Slf4j
public class MinioStorageService {

    private final MinioClient minioClient;

    @Value("${minio.enabled:true}")
    private boolean minioEnabled;

    @Value("${minio.bucket:ticketnow-tickets}")
    private String bucketName;

    @Value("${minio.endpoint:http://localhost:9000}")
    private String minioEndpoint;

    public MinioStorageService(java.util.Optional<MinioClient> minioClient) {
        this.minioClient = minioClient.orElse(null);
    }

    public String uploadQrCode(String ticketCode, byte[] imageBytes) {
        if (!minioEnabled || minioClient == null) {
            log.info("MinIO is disabled or unavailable; falling back to Data URI for ticket {}", ticketCode);
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(imageBytes);
        }

        String objectName = "qrcodes/" + ticketCode + ".png";
        try {
            ensureBucketExists();
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucketName)
                            .object(objectName)
                            .stream(new ByteArrayInputStream(imageBytes), imageBytes.length, -1)
                            .contentType("image/png")
                            .build()
            );

            String publicUrl = minioEndpoint + "/" + bucketName + "/" + objectName;
            log.info("Uploaded QR code to MinIO: {}", publicUrl);
            return publicUrl;
        } catch (Exception e) {
            log.warn("Failed to upload QR code to MinIO: {}. Falling back to Data URI.", e.getMessage());
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(imageBytes);
        }
    }

    private void ensureBucketExists() {
        try {
            boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucketName).build());
            if (!exists) {
                minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucketName).build());
                log.info("Created MinIO bucket: {}", bucketName);
            }
        } catch (Exception e) {
            log.warn("Could not ensure bucket {} exists: {}", bucketName, e.getMessage());
        }
    }
}
