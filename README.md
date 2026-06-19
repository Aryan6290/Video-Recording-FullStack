# Locara Labs: Egocentric Video Capture System

A production-grade, secure, and offline-resilient Egocentric Video Capture System. This workspace includes a React Native mobile client, a robust FastAPI backend service, and modular AWS Terraform configurations.

---

## 📂 Repository Directory Layout

*   **[`/frontend`](file:///Users/aryanbarnwal/Projects/Assignment/frontend)**: React Native mobile application supporting timer-based first-person recording, a local offline-first SQLite database, a background upload queue with exponential backoff, and a keyset-paginated video dashboard.
*   **[`/backend`](file:///Users/aryanbarnwal/Projects/Assignment/backend)**: Python FastAPI backend providing authenticated session handshakes, scoped S3 presigned PUT URL generation with worker-level path isolation, and database update webhook integrations.
*   **[`/infra/terraform`](file:///Users/aryanbarnwal/Projects/Assignment/infra/terraform)**: Modular, production-grade infrastructure configurations for AWS provisioning, including IAM permissions, S3 lifecycle policies (Glacier tiering), and Lambda events.
*   **[`SYSTEM_DESIGN.md`](file:///Users/aryanbarnwal/Projects/Assignment/SYSTEM_DESIGN.md)**: Detailed technical document covering architecture diagrams, database schema optimization (index justifications, SQLite WAL concurrency, keyset cursor pagination), AWS cost optimization metrics, and 10K user scaling plans.

---

## 🛠️ Step-by-Step Setup & Running Guide

### 1. Python FastAPI Backend Service

#### Prerequisites
*   Python 3.11+

#### Setup Instructions
1.  Navigate to the backend folder:
    ```bash
    cd backend
    ```
2.  Create and activate a Python virtual environment:
    ```bash
    python3 -m venv .venv
    source .venv/bin/activate
    ```
3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
4.  Copy environment configurations:
    ```bash
    cp .env.example .env
    ```
5.  Start the FastAPI development server:
    ```bash
    uvicorn app.main:app --host 0.0.0.0 --port 4000 --reload
    ```
    The Swagger interactive documentation will be available at `http://localhost:4000/docs`.

---

### 2. React Native Client Application

#### Prerequisites
*   Node.js (v18+)
*   Android SDK & Android 10+ Emulator/Device (or Xcode for iOS development)

#### Setup Instructions
1.  Navigate to the frontend folder:
    ```bash
    cd frontend
    ```
2.  Install packages:
    ```bash
    npm install
    ```
3.  *(Optional iOS setup)* Install CocoaPods:
    ```bash
    cd ios
    bundle install
    bundle exec pod install
    cd ..
    ```
4.  Start the Metro bundler server:
    ```bash
    npm start
    ```
5.  In a separate terminal, launch the application:
    *   **Android (default)**:
        ```bash
        npm run android
        ```
    *   **iOS**:
        ```bash
        npm run ios
        ```

---

### 3. AWS Infrastructure Provisioning (Terraform)

#### Prerequisites
*   Terraform CLI (>= 1.5.0)

#### Setup Instructions
1.  Navigate to the Terraform folder:
    ```bash
    cd infra/terraform
    ```
2.  Review and customize settings in [terraform.tfvars](file:///Users/aryanbarnwal/Projects/Assignment/infra/terraform/terraform.tfvars) (e.g. bucket naming, backend webhook URLs).
3.  Initialize the workspace:
    ```bash
    terraform init
    ```
4.  Preview resources:
    ```bash
    terraform plan
    ```
5.  Deploy configuration:
    ```bash
    terraform apply
    ```

---

## 📈 System Design, Database Optimization & AWS Cost Analysis

Please refer to the root [**`SYSTEM_DESIGN.md`**](file:///Users/aryanbarnwal/Projects/Assignment/SYSTEM_DESIGN.md) for full evaluations regarding:
*   **Decoupled S3 presigned URL uploads** directly from the client.
*   **SQLite schema details** (`attempt_count`, `last_error`, JSON metadata column) and SQLite WAL performance concurrency settings.
*   **Database Query Optimization** using keyset-based cursor pagination (`idx_videos_worker_history` index).
*   **AWS Least-Privilege IAM Policies** and worker isolation schemas.
*   **Storage cost projections** ($9,060 stabilized monthly run-rate for 900TB storage using Glacier lifecycle rules).
*   **Reliability systems** including S3 bucket notifications triggering Lambda-based webhook updates.
*   **Scalability plans** detailing how RDS Proxy, Amazon SQS buffers, and celery workers resolve bottleneck challenges at 10K concurrent users.
