import type { AxiosRequestConfig } from "axios";
import Axios from "axios";

export const axios = Axios.create({
  baseURL: "",
  withCredentials: true,
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export const apiClient = <T>(config: AxiosRequestConfig): Promise<T> => {
  return axios(config).then((response) => response.data);
};
